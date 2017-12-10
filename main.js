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
		}
	});
};

setInterval(runSystem, 1000);
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
	if (client.status == "wait-ack") {
		awaitAck(client)
	}

	if (client.status == "prepare-ready") {
		prepareTransaction(client);
	}

	if (client.status == "wait-prepare") {
		awaitPrepare(client);
	}

	if (client.status == "commit-ready") {
		commitTransaction(client);
	}

	if (client.status == "wait-commit") {
		awaitCommit(client);
	}
};

// Create a transaction.
// Send it to primary.	
var beginTransaction = function(client) {
	client.lastTransaction += 1;
	var primary = findPrimary(client);
	sendMessage(client.mymid, primary, "BEGIN", { aid: client.lastTransaction })
	client.status = "wait-ack"
};

// NOTE: Don't forget case where there is no primary? Like querying within a view-change.
var findPrimary = function(client) {
	if (client.primary != null) 
		return client.primary;

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
	sendMessage(client.mymid, client.primary, "COMMIT", {{aid: client.lastTransaction, pset: client.viewstamp}});
	client.status = "free";
	client.workToDo = false;
};

var awaitAck = function(client) {
	client.messages = client.messages.filter(function(m) {
		if (m.type != "BEGIN-ACK")
			return true;
		// Confirm that txn is for you?
		client.viewstamp = m.content.pset;
		client.status = "ready";
		$('#transact_button').prop("disabled", false).text("Commit TXN");
		return false;
	});
};

var awaitPrepare = function(client) {
	client.messages = client.messages.filter(function(m) {
		if (m.type != "PREPARED")
			return true;
		// Confirm that txn is for you?
		client.status = "commit-ready"
		$('#transact_button').text("Sending Commit");
		return false;
	});
};

var awaitCommit = function(client) {

};