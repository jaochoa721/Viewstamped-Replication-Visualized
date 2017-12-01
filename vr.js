var HEARTBEAT_TIMEOUT = 5000
var MIN_LATENCY = 1000
var MAX_LATENCY = 2000
var pendingMessages = []

function Message (src, dst, type, content) {
    this.src = src
    this.dst = dst
    this.type = type
    this.content = content
}

var makeMap = function(keys, defaultVal) {
	newMap = new Map()
	for (k in keys) {
		newMap[keys[k]] = defaultVal
	}
	return newMap
}

var sendMessage = function(src, dst, type, content) {
	console.log(src + " -> " + dst, type)
	m = new Message(src, dst, type, content)
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

var createServer = function(id, groupid, peers) {
	return {
		status: 'active',
		up_to_date: true,
		configuration: peers,
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
		invitations: null
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
		
		server.inHeartbeats[m.src] = $.now() + HEARTBEAT_TIMEOUT
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
	for (peer in server.outHeartbeats) {
		if (server.outHeartbeats[peer] <= $.now() + MAX_LATENCY) {
			sendMessage(server.mymid, peer, "HEART", "")
			server.outHeartbeats[peer] += HEARTBEAT_TIMEOUT 
		}
	}
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
	})
}

setInterval(runSystem, 1000)

var startViewChange = function(server) {
	server.status = "view_manager"
	server.invitations = makeMap(server.peers, null)

	newViewId = server.cur_viewid
	newViewId[0] += 1
	server.max_viewid = newViewId

	for (peer in server.configuration) {
		sendMessage(server.mymid, peer, "INVITE", newViewId)
	}
	// if new node is available, or a node missed a heartbeat.
	// Raise the cur_viewid, send it out as message.
	// to all nodes.
}

var checkVoteStatus = function() {
	// Check if your new-view is successful.
	// Make sure you get enough votes, didn't timeout.
	// Make sure votes are valid. 
	// Make sure you weren't invited to a higher view.
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
		console.log(proposedViewId, server.max_viewid)
		if (proposedViewId[0] > server.max_viewid[0] 
			|| (proposedViewId[0] == server.max_viewid[0] 
				&& proposedViewId[1] > server.max_viewid[1])) {
			console.log("I got invited")
			// server.max_viewid = proposedViewId
			server.max_viewid[0] = proposedViewId[0]
			server.max_viewid[1] = proposedViewId[1]
			server.status = "underling"
			acceptance = {}
			// if (server.up_to_date) {
			// 	acceptance.viewstamp = server.viewstamp
			// }
			sendMessage(server.mymid, m.src, "ACCEPT", acceptance)
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