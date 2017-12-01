var HEARTBEAT_TIMEOUT = 5000
var MIN_LATENCY = 1000
var MAX_LATENCY = 2000
var VOTE_TIMEOUT = 5000
var pendingMessages = []

function Message (src, dst, type, content) {
	this.src = src
	this.dst = dst
	this.type = type
	this.content = content
}

var makeMap = function(keys, defaultVal) {
	newMap = new Map()
	keys.forEach(function(k) {
		newMap.set(k, defaultVal)
	})
	return newMap
}

var sendMessage = function(src, dst, type, content) {
	console.log(src + " -> " + dst, type)

	contentCopy = Object.assign({}, content)
	m = new Message(src, dst, type, contentCopy)
	m.deliverTime = $.now() + MIN_LATENCY + Math.random()*(MAX_LATENCY - MIN_LATENCY)
	pendingMessages.push(m)
}

var deliverMessage = function() {
	now = $.now()
	pendingMessages = pendingMessages.filter(function(m) {
		if (m.deliverTime > now)
			return true

		servers[m.dst].messages.push(m)
		return false
	})
}

var createServer = function(id, groupid, configuration) {
	peers = configuration.filter(function(peer) { return peer !== id })
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
	}
}

var createServers = function(total) {
	serverIds = []
	for (i = 0; i < total; i++) {
		serverIds.push(i)
	}

	serverList = []
	for (i = 0; i < 4; i++) {
		newServer = createServer(i, 1, serverIds)
		serverList.push(newServer)
	}
	return serverList
}

servers = createServers(4)

var handleHeartbeats = function(server) {
	if (server.status != "active")
		return

	changeView = receiveHeartbeats(server)
	sendHeartbeats(server)

	return changeView
}

var receiveHeartbeats = function(server) {
	// Reset heartbeat timers on receipt of heartbeat
	changeView = false
	server.messages = server.messages.filter(function(m) {
		if (m.type != "HEART")
			return true

		if (m.src !== server.cur_view.primary && !server.cur_view.backups.includes(m.src)) {
			changeView = true
		}
		
		server.inHeartbeats.set(m.src, $.now() + HEARTBEAT_TIMEOUT)
		return false
	})

	// Check if any heartbeats timers expired
	server.inHeartbeats.forEach(function (time) {
		if (time < $.now())  {
			changeView = true
		}
	})
	return changeView
}

var sendHeartbeats = function(server) {
	server.outHeartbeats.forEach(function(heartbeatTime, peer) {
		if (heartbeatTime <= $.now() + MAX_LATENCY) {
			sendMessage(server.mymid, peer, "HEART", "")
			heartbeatTime += HEARTBEAT_TIMEOUT 
		}
	})
}

var i = 0
var runSystem = function() {
	if (i > 10) 
		return
	console.log("Iteration " + i)
	i++

	deliverMessage()
	// console.log(pendingMessages)
	servers.forEach(function(server) {
		changeView = handleHeartbeats(server)
		if (changeView) 
			startViewChange(server)
		
		handleInvitation(server)
		outcome = checkVoteStatus(server)
		if (outcome == 1) {
			console.log("Server", server.mymid, "is ready to start a view!")
		}
	})
}

setInterval(runSystem, 1000)

var makeAcceptance = function(server) {
	acceptance = {}
	acceptance.up_to_date = server.up_to_date
	if (server.up_to_date) {
		acceptance.curViewstamp = server.history[server.history.length - 1]
		acceptance.isPrimary = server.cur_view.primary === server.mymid
	} else {
		acceptance.viewid = server.cur_viewid
	}
	return acceptance
}

var startViewChange = function(server) {
	server.status = "view_manager"
	server.invitations = makeMap(server.configuration, null)
	server.invitations.set(server.mymid, makeAcceptance(server))
	server.electionEnd = $.now() + VOTE_TIMEOUT

	newViewId = server.cur_viewid
	newViewId[0] += 1
	server.max_viewid = newViewId

	for (peer in server.configuration) {
		if (peer == server.mymid)
			return
		sendMessage(server.mymid, peer, "INVITE", newViewId)
	}
	// if new node is available, or a node missed a heartbeat.
	// Raise the cur_viewid, send it out as message.
	// to all nodes.
}

var viewIdCompare = function(a, b) {
	if (a[0] > b[0] || (a[0] == a[0] && a[1] > b[1]))
		return -1

	if (a[0] < b[0] || (a[0] == a[0] && a[1] < b[1]))
		return 1

	return 0
}

var checkVoteStatus = function(server) {
	// Check if your new-view is successful.
	// Make sure you get enough votes, didn't timeout.
	// Make sure votes are valid. 

	if (server.status != "view_manager" 
		|| (server.status == "view_manager" && server.electionEnd > $.now()))
		return 0

	acceptCount = 1 // By default, you've accepted.
	server.messages = server.messages.filter(function(m) {
		if (m.type != "ACCEPT")
			return true

		acceptCount += 1
		server.invitations.set(m.src, m.content)
		return false
	})

	if (acceptCount < Math.floor(server.configuration.length/2) + 1)
		return -1

	normalCount = 0
	crashViewId = [-1, -1]
	normalViewId = [-1, -1]
	oldPrimaryNormal = false

	x = server.invitations
	server.invitations.forEach(function(acceptance, peer) {
		console.log(acceptance)
		if (acceptance.up_to_date) {
			normalCount += 1

			if (viewIdCompare(normalViewId, acceptance.curViewstamp.viewid) == 1) {
				normalViewId = acceptance.curViewstamp.viewid
				oldPrimaryNormal = false
			}

			if (viewIdCompare(normalViewId, acceptance.curViewstamp.viewid) == 0
				&& acceptance.isPrimary)
				oldPrimaryNormal = true
		} else {
			if (viewIdCompare(crashViewId, acceptance.viewid) == 1)
				crashViewId = acceptance.viewid
		}
	})

	if (normalCount > Math.floor(server.configuration.length/2))
		return 1

	if (viewIdCompare(crashViewId, normalViewId) == 1)
		return 1

	if (viewIdCompare(crashViewId, normalViewId) == 0 && oldPrimaryNormal)
		return 1
	return -1
}

var beginView = function() {
	// if checkVoteStatus == true:
	// send out InitView to the real primary.
	// Or write NewView to the buffer.
	// Become Active.
}

var handleInvitation = function(server) {
	// If this view_id > max,
	// send an Accept. Record max Viewid.
	// Become underling.
	server.messages = server.messages.filter(function(m) {
		if (m.type != "INVITE")
			return true
		
		proposedViewId = m.content
		if (viewIdCompare(proposedViewId, server.max_viewid) == -1) {
			server.max_viewid = proposedViewId
			server.status = "underling"
			sendMessage(server.mymid, m.src, "ACCEPT", makeAcceptance(server))
		}

		return false
	})
}

var awaitView = function() {
	// Check the status by waiting for a message
	// that has the max_viewid you recorded. => Become active
	// If election times out, then run a view
	// change yourself. 
	// If you receive an voteRequest for bigger view_id, accept it.
}