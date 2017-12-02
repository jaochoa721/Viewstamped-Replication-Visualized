/*jshint browser: true */
'use strict';

var HEARTBEAT_TIMEOUT = 5000;
var MIN_LATENCY = 1000;
var MAX_LATENCY = 2000;
var VOTE_TIMEOUT = 5000;
var pendingMessages = [];

function Message (src, dst, type, content) {
	this.src = src;
	this.dst = dst;
	this.type = type;
	this.content = content;
}

var makeMap = function(keys, defaultVal) {
	var newMap = new Map();
	keys.forEach(function(k) {
		newMap.set(k, defaultVal);
	});
	return newMap;
};

var sendMessage = function(src, dst, type, content) {
	console.log(src + " -> " + dst, type);

	var contentCopy = Object.assign({}, content);
	var m = new Message(src, dst, type, contentCopy);
	m.deliverTime = $.now() + MIN_LATENCY + Math.random()*(MAX_LATENCY - MIN_LATENCY);
	pendingMessages.push(m);
};

var deliverMessage = function() {
	var now = $.now();
	pendingMessages = pendingMessages.filter(function(m) {
		if (m.deliverTime > now)
			return true;

		servers[m.dst].messages.push(m);
		return false;
	});
};

var createServer = function(id, groupid, configuration) {
	var peers = configuration.filter(function(peer) { return peer !== id; });
	return {
		status: 'active',
		up_to_date: true,
		configuration: configuration,
		mymid: id,
		mygroupid: groupid,
		cur_viewid: [1, id],
		cur_view: {
			primary: null,
			backups: [id]
		},
		max_viewid: [1, id],
		timestamp: 1,
		inHeartbeats: makeMap(peers, $.now() + HEARTBEAT_TIMEOUT),
		outHeartbeats: makeMap(peers, $.now()),
		messages: [],
		invitations: null,
		electionEnd: null,
		history: [{viewid: [-1, -1], ts: 1}]
		// Is backup?
		// Buffer. ?
		// History. ?
		// Gstate. ?
	};
};

var createServers = function(total) {
	var serverIds = [];
	for (var i = 0; i < total; i++) {
		serverIds.push(i);
	}

	var serverList = [];
	for (i = 0; i < 4; i++) {
		var newServer = createServer(i, 1, serverIds);
		serverList.push(newServer);
	}
	return serverList;
};

var servers = createServers(4);

var handleHeartbeats = function(server) {
	if (server.status != "active")
		return false;

	var changeView = receiveHeartbeats(server);
	sendHeartbeats(server);

	return changeView;
};

var receiveHeartbeats = function(server) {
	// Reset heartbeat timers on receipt of heartbeat
	var changeView = false;
	server.messages = server.messages.filter(function(m) {
		if (m.type != "HEART")
			return true;

		if (m.src !== server.cur_view.primary && !server.cur_view.backups.includes(m.src)) {
			changeView = true;
		}
		
		server.inHeartbeats.set(m.src, $.now() + HEARTBEAT_TIMEOUT);
		return false;
	});

	// Check if any heartbeats timers expired
	server.inHeartbeats.forEach(function (time) {
		if (time < $.now())  {
			changeView = true;
		}
	});
	return changeView;
};

var sendHeartbeats = function(server) {
	server.outHeartbeats.forEach(function(heartbeatTime, peer) {
		if (heartbeatTime <= $.now() + MAX_LATENCY) {
			sendMessage(server.mymid, peer, "HEART", "");
			server.outHeartbeats[peer] += HEARTBEAT_TIMEOUT;
		}
	});
};

var i = 0;
var runSystem = function() {
	if (i > 10) 
		return;
	console.log("Iteration " + i);
	i++;

	deliverMessage();
	servers.forEach(function(server) {
		var changeView = handleHeartbeats(server);
		if (changeView) 
			startViewChange(server);
		
		handleInvitation(server);
		var outcome = countVotes(server);
		if (outcome == 1) {
			console.log("Server", server.mymid, "is ready to start a view!");
		}
	});
};

setInterval(runSystem, 1000);

var makeAcceptance = function(server) {
	var acceptance = {};
	acceptance.up_to_date = server.up_to_date;
	if (server.up_to_date) {
		acceptance.curViewstamp = server.history[server.history.length - 1];
		acceptance.isPrimary = server.cur_view.primary === server.mymid;
	} else {
		acceptance.viewid = server.cur_viewid;
	}
	return acceptance;
};

var startViewChange = function(server) {
	server.status = "view_manager";
	server.invitations = makeMap(server.configuration, null);
	server.invitations.set(server.mymid, makeAcceptance(server));
	server.electionEnd = $.now() + VOTE_TIMEOUT;

	var newViewId = server.cur_viewid;
	newViewId[0] += 1;
	server.max_viewid = newViewId;

	for (var peer in server.configuration) {
		if (peer == server.mymid)
			continue;
		sendMessage(server.mymid, peer, "INVITE", newViewId);
	}
};

var viewIdCompare = function(a, b) {
	if (a[0] > b[0] || (a[0] == a[0] && a[1] > b[1]))
		return -1;

	if (a[0] < b[0] || (a[0] == a[0] && a[1] < b[1]))
		return 1;

	return 0;
};

var countVotes = function(server) {
	// Check if coordinating election
	// Check if time to count votes.
	if (server.status != "view_manager" 
		|| (server.status == "view_manager" && server.electionEnd > $.now()))
		return 0;

	// Count/Store Responses (By default, you've accepted.)
	var acceptCount = 1;
	server.messages = server.messages.filter(function(m) {
		if (m.type != "ACCEPT")
			return true;

		acceptCount += 1;
		server.invitations.set(m.src, m.content);
		return false;
	});

	// If no majority, failed view-change.
	if (acceptCount < Math.floor(server.configuration.length/2) + 1)
		return -1;

	var normalCount = 0;           // # of Normal Accepts
	var crashViewId = [-1, -1];    // Highest 'crashed' viewid
	var normalViewId = [-1, -1];   // Highest 'normal' viewid
	var oldPrimaryNormal = false;  // If primary of normalViewId accepted normally.

	// The following snippet computes the values of previous 4 variables.
	server.invitations.forEach(function(acceptance, peer) {
		if (acceptance.up_to_date) {
			normalCount += 1;

			if (viewIdCompare(normalViewId, acceptance.curViewstamp.viewid) == 1) {
				normalViewId = acceptance.curViewstamp.viewid;
				oldPrimaryNormal = false;
			}

			if (viewIdCompare(normalViewId, acceptance.curViewstamp.viewid) == 0
				&& acceptance.isPrimary)
				oldPrimaryNormal = true;
		} else { 
			if (viewIdCompare(crashViewId, acceptance.viewid) == 1)
				crashViewId = acceptance.viewid;
		}
	});

	if (normalCount > Math.floor(server.configuration.length/2)
		|| viewIdCompare(crashViewId, normalViewId) == 1
		|| viewIdCompare(crashViewId, normalViewId) == 0 && oldPrimaryNormal)
		return 1;

	return -1;
};

var beginView = function() {
	// if checkVoteStatus == true:
	// send out InitView to the real primary.
	// Or write NewView to the buffer.
	// Become Active.
};

var handleInvitation = function(server) {
	// If this view_id > max,
	// send an Accept. Record max Viewid.
	// Become underling.
	server.messages = server.messages.filter(function(m) {
		if (m.type != "INVITE")
			return true;
		
		var proposedViewId = m.content;
		if (viewIdCompare(proposedViewId, server.max_viewid) == -1) {
			server.max_viewid = proposedViewId;
			server.status = "underling";
			server.electionEnd = $.now() + VOTE_TIMEOUT;
			sendMessage(server.mymid, m.src, "ACCEPT", makeAcceptance(server));
		}

		return false;
	});
};

var awaitView = function() {
	// Check the status by waiting for a message
	// that has the max_viewid you recorded. => Become active
	// If election times out, then run a view
	// change yourself. 
	// If you receive an voteRequest for bigger view_id, accept it.
};