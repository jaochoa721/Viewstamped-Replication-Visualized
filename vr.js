/*jshint browser: true */
'use strict';

var HEARTBEAT_TIMEOUT = 5000;
var MIN_LATENCY = 1000 ;
var MAX_LATENCY = 1000 + 2000;
var VOTE_TIMEOUT = 6000 ;
var NUM_SERVERS = 5;
var pendingMessages = [];

function Message (src, dst, type, content) {
	this.src = parseInt(src);
	this.dst = parseInt(dst);
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
	if (type !== "HEART")
		console.log(src + " -> " + dst, type, content);

	var contentCopy = JSON.parse(JSON.stringify(content));
	var m = new Message(src, dst, type, contentCopy);
	var rando = MIN_LATENCY + Math.random()*(MAX_LATENCY - MIN_LATENCY);

	m.deliverTime = $.now() + rando;

	window.animateMessage(m);
	pendingMessages.push(m);
};

var deliverMessage = function() {
	var now = $.now();
	pendingMessages = pendingMessages.filter(function(m) {
		if (m.deliverTime > now)
			return true;

		nodes[m.dst].messages.push(m);
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
		cur_viewid: [1, 1],
		cur_view: {
			primary: null,
			backups: [id]
		},
		max_viewid: [1, 1],
		timestamp: 1,
		inHeartbeats: makeMap(peers, $.now() + HEARTBEAT_TIMEOUT),
		outHeartbeats: makeMap(peers, $.now()),
		messages: [],
		invitations: null,
		electionEnd: null,
		history: [{viewid: [1, 1], ts: 1}],
		log: []
		// Is backup?
		// Buffer. ?
		// History. ?
		// Gstate. ?
	};
};

var createClient = function(servers) {
	return {
		mymid: NUM_SERVERS,
		messages: [],
		viewid: [0, 0],
		lastTransaction: -1,
		primary: null,
		status: "free",
		workToDo: false,
		timeout: null,
		servers: servers,
		attempts: 0,
		primaryProbes: 0,
		log: [],
		unackedTxns: new Map()
	};
};

var createServers = function(total) {
	var serverIds = [];
	for (var i = 0; i < total; i++) {
		serverIds.push(i);
	}

	var serverList = [];
	for (i = 0; i < total; i++) {
		var newServer = createServer(i, 1, serverIds);
		serverList.push(newServer);
	}
	return serverList;
};

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

		if (!isInView(server, m.src)) {
			changeView = true;
		}
		
		server.inHeartbeats.set(m.src, server.inHeartbeats.get(m.src) + HEARTBEAT_TIMEOUT);
		return false;
	});

	// Check if any heartbeats timers expired
	server.inHeartbeats.forEach(function (time, peer) {
		if (time < $.now() && isInView(server, peer))  {
			changeView = true;
		}
	});
	return changeView;
};

var isInView = function(server, peer) {
	return (peer === server.cur_view.primary || server.cur_view.backups.includes(peer));
};

var sendHeartbeats = function(server) {
	server.outHeartbeats.forEach(function(heartbeatTime, peer) {
		if (heartbeatTime <= $.now() + MAX_LATENCY + 3000) {
			sendMessage(server.mymid, peer, "HEART", "");
			server.outHeartbeats.set(peer, heartbeatTime + HEARTBEAT_TIMEOUT);
		}
	});
};

var retryElection = function(server) {
	return (server.status === "failed-election"
		&& server.retryTime < $.now());
};

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

var handleCrash = function(server) {
	server.up_to_date = false;
	server.max_viewid = server.cur_viewid;
};

var startViewChange = function(server) {
	server.status = "view_manager";
	server.invitations = makeMap(server.configuration, null);
	server.invitations.set(server.mymid, makeAcceptance(server));
	server.electionEnd = $.now() + VOTE_TIMEOUT;

	var newViewId = [server.max_viewid[0] + 1, server.mymid];
	server.max_viewid = newViewId;

	server.messages = server.messages.filter(function (m) {
		return m.type !== "ACCEPT";
	});
	for (var peer in server.configuration) {
		if (peer == server.mymid)
			continue;
		sendMessage(server.mymid, peer, "INVITE", newViewId);
	}
};

var viewIdCompare = function(a, b) {
	if (a[0] > b[0] || (a[0] == b[0] && a[1] > b[1]))
		return -1;

	if (a[0] < b[0] || (a[0] == b[0] && a[1] < b[1]))
		return 1;

	return 0;
};

var countVotes = function(server, newView) {
	// Check if coordinating election
	// Check if time to count votes.
	// || (server.status == "view_manager" && server.electionEnd > $.now()))
	if (server.status != "view_manager")
		return 0;

	// Count/Store Responses (By default, you've accepted.)
	server.messages = server.messages.filter(function(m) {
		if (m.type != "ACCEPT")
			return true;

		server.invitations.set(m.src, m.content);
		return false;
	});

	if (server.electionEnd > $.now())
		return 0;

	var acceptCount = 0
	server.invitations.forEach(function(acceptance, peer) {
		console.log(acceptance)
		if (acceptance != null)
			acceptCount += 1
	})

	// If no majority, failed view-change.
	if (acceptCount < Math.floor(server.configuration.length/2) + 1)
		return -1;

	var normalCount = 0;           // # of Normal Accepts
	var crashViewId = [-1, -1];    // Highest 'crashed' viewid
	var normalViewId = [-1, -1];   // Highest 'normal' viewid
	var oldPrimaryNormal = false;  // If primary of normalViewId accepted normally.
	var oldPrimary = null;
	var cohortsInView = [];

	// The following snippet computes the values of previous variables.
	server.invitations.forEach(function(acceptance, peer) {
		if (acceptance === null)
			return;
		console.log("Counting votes: ", acceptance);
		cohortsInView.push(peer);
		if (acceptance.up_to_date) {
			normalCount += 1;

			// Update normal viewid
			if (viewIdCompare(normalViewId, acceptance.curViewstamp.viewid) == 1) {
				normalViewId = acceptance.curViewstamp.viewid;
				oldPrimaryNormal = false;
			}
			if (viewIdCompare(normalViewId, acceptance.curViewstamp.viewid) == 0
				&& acceptance.isPrimary) {
				oldPrimaryNormal = true;
				oldPrimary = peer;
			}
		} else { 
			if (viewIdCompare(crashViewId, acceptance.viewid) == 1)
				crashViewId = acceptance.viewid;
		}
	});

	var latestTimestamp = -1;
	var candidatePrimary = (oldPrimaryNormal) ? oldPrimary : null;
	// Find the next primary.
	if (candidatePrimary == null) {
		server.invitations.forEach(function(acceptance, peer) {
			if (acceptance == null)
				return;

			if (acceptance.up_to_date 
				&& viewIdCompare(acceptance.curViewstamp.viewid, normalViewId) == 0) {
				if (acceptance.curViewstamp.ts >= latestTimestamp) {
					latestTimestamp = acceptance.curViewstamp.ts;
					candidatePrimary = peer;
				}
			}
		});
	}

	if (normalCount > Math.floor(server.configuration.length/2)
		|| viewIdCompare(crashViewId, normalViewId) == 1
		|| viewIdCompare(crashViewId, normalViewId) == 0 && oldPrimaryNormal) {
		newView.primary = candidatePrimary;
		newView.backups = cohortsInView.filter(function(peer) {
			return peer !== candidatePrimary;
		});
		if (server.mymid !== candidatePrimary) {
			sendMessage(server.mymid, candidatePrimary, "INITVIEW", 
						{viewid : server.max_viewid, view: newView});
			server.status = "underling";
			server.electionEnd = $.now() + VOTE_TIMEOUT;
			return 0;
		}
		return 1;
	}

	return -1;
};

var beginView = function(server, newView) {
	// if checkVoteStatus == true:
	// send out InitView to the real primary.
	// Or write NewView to the buffer.
	// Become Active.
	server.cur_viewid = server.max_viewid;
	server.cur_view = newView;
	server.timestamp = 0;
	server.log.push({viewid: server.cur_viewid, ts:0, operation: "New view"})
	server.history.push({viewid: server.cur_viewid, ts:0});

	server.inHeartbeats.forEach(function(time, peer, map) {
		map.set(peer, $.now() + HEARTBEAT_TIMEOUT + MAX_LATENCY);
	});
	server.outHeartbeats.forEach(function(time, peer, map) {
		map.set(peer, $.now() + HEARTBEAT_TIMEOUT + MAX_LATENCY);
	});	
	server.messages = server.messages.filter(function (m) {
		return m.type !== "HEART";
	});	

	var eventRecord = {cur_view: newView, history: server.history, log: server.log};
	newView.backups.forEach(function (peer) {
		sendMessage(server.mymid, peer, "NEWVIEW", eventRecord);
	});
	server.status = "active";
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
			console.log("Server", server.mymid, "accepted Server", m.src, "because", proposedViewId, ">", server.max_viewid)
			server.max_viewid = proposedViewId;
			server.status = "underling";
			server.electionEnd = $.now() + 2*VOTE_TIMEOUT;
			sendMessage(server.mymid, m.src, "ACCEPT", makeAcceptance(server));
		} else {
			console.log("Server", server.mymid, "rejected Server", m.src, "because", proposedViewId, "<", server.max_viewid)
		}

		return false;
	});
};

var awaitView = function(server) {
	if (server.status != "underling")
		return false;

	var newviewReceived = false;
	server.messages = server.messages.filter(function(m) {
		if (m.type != "NEWVIEW" && m.type != "INITVIEW")
			return true;

		var eventRecord = m.content;
		var initViewObj = m.content;
		
		var newViewId; 
		if (m.type == "NEWVIEW") {
			newViewId = eventRecord.history[eventRecord.history.length - 1].viewid;
		} else {
			newViewId = initViewObj.viewid;
		}
		
		if (viewIdCompare(newViewId, server.max_viewid) != 0)
			return false; // Correct? Can it ever become relevant?

		newviewReceived = true;
		if (m.type == "NEWVIEW") {
			server.cur_view = eventRecord.cur_view;
			server.cur_viewid = newViewId;
			server.history = eventRecord.history;
			server.log = eventRecord.log;
			server.status = "active";
			server.inHeartbeats.forEach(function(time, peer, map) {
				map.set(peer, $.now() + HEARTBEAT_TIMEOUT);
			});
			server.outHeartbeats.forEach(function(time, peer, map) {
				map.set(peer, $.now() + HEARTBEAT_TIMEOUT);
			});
			console.log("Server ",server.mymid, " has updated its heartbeats!");
		}

		if (m.type == "INITVIEW") {
			beginView(server, initViewObj.view);
		}
		return false;
	});

	if (newviewReceived) {
		server.messages = server.messages.filter(function (m) {
			return m.type !== "HEART";
		});	
	}
	if (!newviewReceived && server.electionEnd < $.now()) 
		return true;

	return false;
	// Check the status by waiting for a message
	// that has the max_viewid you recorded. => Become active
	// If election times out, then run a view
	// change yourself. 
	// If you receive an voteRequest for bigger view_id, accept it.
};

// Handle situation where no longer primary. 
var handleBegin = function(server) {
	if (server.status != 'active') return;
	server.messages = server.messages.filter(function(m){
		if (m.type != "BEGIN")
			return true;


		if (viewIdCompare(m.content.viewid, server.cur_viewid) != 0) {
			sendMessage(server.mymid, m.src, "UPDATE-VIEW", { viewid: server.cur_viewid, aid : m.content.aid});
			return false;
		}

		var viewstamp = addToBuffer(server, 'completed-call', m.content.aid);
		sendMessage(server.mymid, m.src, "BEGIN-ACK", {pset: viewstamp, aid : m.content.aid});
		return false;
	});
};

var handlePrepare = function(server) {
	server.messages = server.messages.filter(function(m){
		if (m.type != "PREPARE")
			return true;

		// Really a viewid...
		var pset = m.content.pset;
		var compatible = true;
		server.history.forEach(function(viewstamp) {
			if (viewIdCompare(pset.viewid, viewstamp.viewid) == 0) {
				if (pset.ts > viewstamp.ts) {
					console.log(viewstamp, pset)
					compatible = false;
				}
			}
		});

		if (!compatible) {
			sendMessage(server.mymid, m.src, "REFUSE", {aid: m.content.aid});
			addToBuffer(server, 'aborted', m.content.aid);
		} else {
			// Assert that backups have ACK'd info.
			var count = 0;
			servers.forEach(function(peer){
				if (peer.status != "active")
					return;

				var result = peer.history.find(function(viewstamp){
					if (viewIdCompare(pset.viewid, viewstamp.viewid) === 0) {
						if (pset.ts <= viewstamp.ts)
							return true;
					}
					return false;
				});

				if (result)
					count += 1;
			});

			if (count > Math.floor(server.configuration.length/2))
				sendMessage(server.mymid, m.src, "PREPARED", {aid: m.content.aid});
			else {
				console.log("oh no, not everyone has the copy. We'll try later.");
				return true;
			}
		}
		return false;
	});
};

var handleCommit = function(server) {
	server.messages = server.messages.filter(function(m){
		if (m.type != "COMMIT")
			return true;
		addToBuffer(server, 'committed', m.content.aid);
		sendMessage(server.mymid, m.src, "DONE", {aid: m.content.aid});
	});
};

var handleAbort = function(server) {
	server.messages = server.messages.filter(function(m){
		if (m.type != "ABORT")
			return true;
		addToBuffer(server, 'aborted', m.content.aid);
	});
};

var addToBuffer = function(server, operation, aid) {
	server.timestamp += 1;
	var viewstamp = {viewid: server.cur_viewid, ts: server.timestamp}
	server.history[server.history.length - 1].ts += 1;

	viewstamp.operation = operation;
	viewstamp.aid = aid;
	server.log.push(viewstamp)

	server.cur_view.backups.forEach(function(backup) {
		sendMessage(server.mymid, backup, "COPY", viewstamp);
	});
	return viewstamp;
}; 

var updateHistory = function(server) {
	// Confirm message is from primary?
	// Save more information?
	server.messages = server.messages.filter(function(m){
		if (m.type != "COPY")
			return true;
		server.log.push(m.content);
		server.history[server.history.length - 1].ts += 1;
		return false;
	});
};

