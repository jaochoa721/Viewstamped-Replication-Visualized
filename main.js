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

		handleBegin(server);
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
			client.status = "commit-ready";
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

	// On Client-Commit:
	// 		Send a commit to primary.
	//		Wait for prepares.
	// On Prepares:
	//		Commit Txn
	// On Commit:
	//		Report success? Set status to ready.
	if (client.status == "commit-ready") {
		prepareTransaction(client);
	}

	if (client.status == "wait-prepare") {
		var res = awaitPrepare(client);
		if (res == 1)
			commitTransaction(client);
		// Otherwise, abort, or retry.
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

};

var commitTransaction = function(client) {

};

var awaitAck = function(client) {
	client.messages = client.messages.filter(function(m) {
		if (m.type != "BEGIN-ACK")
			return true;
		// Confirm that txn is for you?
		client.viewstamp = m.content.pset.viewstamp;
		client.status = "ready";
		$('#transact_button').prop("disabled", false).text("Commit");
		return false;
	});
};

var awaitPrepare = function(client) {

};

var awaitCommit = function(client) {

};