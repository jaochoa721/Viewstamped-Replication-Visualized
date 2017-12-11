'use strict';

var servers = createServers(NUM_SERVERS);
var client = createClient(servers);
var nodes = servers.concat(client);

var i = 0;
var stop = false;
var runSystem = function() {
	if (stop === true) 
		return;
	console.log("Iteration " + i);
	i++;

	deliverMessage();

	if (window.drawServer) {
		servers.forEach(function(server) {
			// 27 is width of server box.
			window.drawServer(30, server);
		});
	}

	runClient(client);

	servers.forEach(function(server) {
		if (server.status == "stop") {
			server.messages = [];
			return;
		}
		var changeView = handleHeartbeats(server);
		var voteExpired = awaitView(server);
		var restartVote = retryElection(server);

		if (changeView || voteExpired || restartVote)  {
			console.log("Server ", server.mymid, "Heart:", changeView, "Vote:", voteExpired, "restartVote", restartVote);
			startViewChange(server);
		}

		if (voteExpired)
			console.log("Server", server.mymid, "thinks the election expired.");
		
		handleInvitation(server);
		var newView = {};
		var outcome = countVotes(server, newView);
		if (outcome == 1) {
			beginView(server, newView)
			console.log("Server", server.mymid, "is ready to start a view!");
			console.log("New view", newView)
		}
		if (outcome == -1) {
			console.log("Server", server.mymid, "failed an election!");
			server.status = "failed-election"
			server.retryTime = $.now() + 2*VOTE_TIMEOUT;
		}

		if (server.status == "active") {
			handleBegin(server);
			updateHistory(server);
			handlePrepare(server);
			handleCommit(server);
		}
	});
};

setInterval(runSystem, 1000);

var tweens = [];
function animate(time) {
    requestAnimationFrame(animate);
    TWEEN.update(time);
}
requestAnimationFrame(animate);

var road;
for (var i = 0; i < servers.length; ++i) {
	for (var j = i + 1; j < servers.length; ++j) {

	}
}

var msgCounter = 0;

var createTween = function(srcPos, destPos, delay, elem) {
	var coords = srcPos; // Start at (0, 0)
	var tween = new TWEEN.Tween(coords) // Create a new tween that modifies 'coords'.
	        .to(destPos, delay) // Move to (300, 200) in 1 second.
	        .easing(TWEEN.Easing.Linear.None)
	        .onUpdate(function() { 
	            elem.style.setProperty('top', coords.y + 'px');
	            elem.style.setProperty('left', coords.x + 'px')
	            // console.log("COORDS: ", coords)
	        })
	return tween;
}

window.animateMessage = function(msg) {
	var src = msg.src;
	var dest = msg.dst;
	msgCounter += 1;
	var msgText = (msg.type == "HEART") ? "♥" : msg.type;
	// var msgText = (msg.type == "INVITE") ? "I" : msgText;
	var arrowMessage = $('<pre id="message' + msgCounter + '">' + msgText + '</pre>');
	arrowMessage.insertAfter("#container");

	arrowMessage.css({position: 'absolute'});
	// var source = 
	var arrowPos = arrowMessage.position();
	var srcPos = $('#' + src).offset();
	var destPos = $('#' + dest).offset();
	// console.log(srcPos, destPos)
	var ele = arrowMessage.get(0);
	ele.style.setProperty('top',srcPos.top  + 200 + 'px');
	ele.style.setProperty('left',srcPos.left + 10 + 'px');

	var space = 20;
	var tweenDown = createTween({ x: srcPos.left + 10, y: srcPos.top + 200},
							{ x: srcPos.left + 10, y: srcPos.top + 200 + space*(dest+1)},
							500, ele);

	var tweenAcross = createTween({ x: srcPos.left + 10, y: srcPos.top + 200 + space *(dest+1) },
								{ x: destPos.left + 10, y: destPos.top + 200 + space*(dest+1) }, 
								msg.deliverTime - $.now() - 1000, ele);

	var tweenUp = createTween({ x: destPos.left + 10, y: destPos.top + 200 + space*(dest+1)},
							{ x: destPos.left + 10, y: destPos.top + 200},
							500, ele);
	tweenUp.onComplete(function() { arrowMessage.remove(); });

	tweenDown.chain(tweenAcross);
	tweenAcross.chain(tweenUp);
	tweenDown.start();
};

window.onload = function () {
	initializeDraw();
	$('#transact_button').click(function(e) {
		if (!client.workToDo) {
			client.workToDo = true;
			$(this).text("Awaiting Ack").prop("disabled", true);
		}
		if (client.workToDo && client.status == "ready") {
			client.status = "prepare-ready";
			$(this).text("Awaiting Prep").prop("disabled", true);
		}
	});
}

var runClient = function(client) {
	if (!client.workToDo) return;

	if (client.status == "free") {
		beginTransaction(client);
	}
	
	// Await an ACK.
	// 		On Ack: Allow Client to Commit.
	//		On Timeout: Abort? or Retry?
	var abort = false;
	if (client.status == "wait-ack") {
		var result = awaitAck(client)
		if (result == -1) abort = true;
	}

	if (client.status == "prepare-ready") {
		prepareTransaction(client);
	}

	if (client.status == "wait-prepare") {
		var refused = awaitPrepare(client);
		console.log("Did we prepare", refused);
		if (refused) abort = true;
	}

	if (client.status == "commit-ready") {
		commitTransaction(client);
	}

	if (client.status == "wait-commit") {
		awaitCommit(client);
	}

	if (abort)
		abortTransaction(client);
};

var abortTransaction = function(client) {
	var primary = findPrimary(client);
	if (primary)
		sendMessage(client.mymid, primary, "ABORT", { aid: client.lastTransaction });
	client.status = "free";
	$('#transact_button').prop("disabled", false).text("Begin TXN");
};

// Create a transaction.
// Send it to primary.	
var beginTransaction = function(client) {
	client.lastTransaction += 1;
	var primary = findPrimary(client);
	sendMessage(client.mymid, primary, "BEGIN", { aid: client.lastTransaction });
	client.status = "wait-ack";
	client.timeout = $.now() + 2.5*MAX_LATENCY;
};

// NOTE: Don't forget case where there is no primary? Like querying within a view-change.
var findPrimary = function(client) {
	// if (client.primary != null) 
	// 	return client.primary;

	var activeServer = client.servers.find(function(server) {
		return (server.status == "active");
	});

	if (activeServer == null) 
		return null;
	client.primary = activeServer.cur_view.primary;
	return client.primary;
}

var prepareTransaction = function(client) {
	sendMessage(client.mymid, client.primary, "PREPARE", {aid: client.lastTransaction, pset: client.viewstamp});
	client.status = "wait-prepare";
};

var commitTransaction = function(client) {
	sendMessage(client.mymid, client.primary, "COMMIT", {aid: client.lastTransaction, pset: client.viewstamp});
	client.status = "free";
	client.workToDo = false;
};

var awaitAck = function(client) {
	var ackDelivered = false;
	client.messages = client.messages.filter(function(m) {
		if (m.type != "BEGIN-ACK")
			return true;
		// Confirm that txn is for you?
		ackDelivered = true;
		client.viewstamp = m.content.pset;
		client.status = "ready";
		$('#transact_button').prop("disabled", false).text("Commit TXN");
		return false;
	});
	if (!ackDelivered && client.timeout < $.now())
		return -1;
	return 0;
};

var awaitPrepare = function(client) {
	var refused = false; 
	client.messages = client.messages.filter(function(m) {
		if (m.type != "PREPARED" && m.type != "REFUSE")
			return true;
		// Confirm that txn is for you?
		if (m.type == "PREPARED") {
			client.status = "commit-ready"
		} else {
			refused = true;
		}
		$('#transact_button').text("Begin TXN").prop("disabled", false);
		return false;
	});
	return refused;
};

var awaitCommit = function(client) {

};