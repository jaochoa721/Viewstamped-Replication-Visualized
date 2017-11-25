var HEARTBEAT_TIMEOUT = 5000
var LATENCY = 2000
var SLOW = 1000
var pendingMessages = []

function Message (src, dst, type, content) {
    this.src = src;
    this.dst = dst;
    this.type = type;
    this.content = content;
}

var makeMap = function(keys, defaultVal) {
	newMap = {}
	for (k in keys) {
		newMap[keys[k]] = defaultVal
	}
	return newMap
}

// Initialize Servers to be a view with only itself.
// Will result in triggering a viewchange when it gets
// heartbeat from someone not in the view. 
var createHearts = function(id, peers) {
	newMap = {}
	peers.forEach(function(peer) {
		if (peer == id) 
			return
		newMap[peer] = {
			time: (id == 0) ? $.now() : $.now() + 2*(LATENCY + SLOW),
			state: "chill"
		}
	})

	return newMap
}

var sendMessage = function(m) {
	console.log(m.src + " -> " + m.dst)
	m.deliverTime = $.now() + LATENCY + SLOW * Math.random()
	pendingMessages.push(m)
}

var deliverMessage = function() {
	now = $.now()
	pendingMessages = pendingMessages.filter(function(m) {
		if (m.deliverTime > now)
			return true
		// console.log(""m.dst)
		servers[m.dst].messages.push(m)
		return false
	})
}

var messageSystem = function () {
	deliverMessage()
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
		heartBeats: createHearts(id, peers),
		messages: []
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

var receiveHeartbeat = function(server) {
	// Look at delivered, heartbeat, messages.
	// Reset timer for heart.
	// Send heart back.
	// console.log("hi")
	changeView = false
	server.messages = server.messages.filter(function(m) {
		if (m.type != "HEART")
			return true

		if (m.src !== server.cur_view.primary && !server.cur_view.backups.includes(m.src)) {
			changeView = true
		}
		
		if (m.content == "IN") {
			server.heartBeats[m.src].time = $.now() + (LATENCY + SLOW + HEARTBEAT_TIMEOUT)
			server.heartBeats[m.src].state = "chill"
			message = new Message(server.mymid, m.src, "HEART", "REPLY")

			sendMessage(message)
		}
		if (m.content == "REPLY") {
			server.heartBeats[m.src].time = $.now() + HEARTBEAT_TIMEOUT + LATENCY
			server.heartBeats[m.src].state = "chill"
		}

		return false
	})
	return changeView
}

var checkHeartbeat = function(server) {
	now = $.now()
	changeView = false

	for (key in server.heartBeats) {
		heart = server.heartBeats[key]

		if (heart.time < now && heart.state == "chill") {
			heart.state = "waiting"
			heart.time = $.now() + 2 * (LATENCY + SLOW)
			message = new Message(server.mymid, key, "HEART", "IN")
			sendMessage(message)

		} else if (heart.time < now && heart.state == "waiting") {
			console.log("expired")
			changeView = true
		}
	}
	return changeView
}

var i = 0
var runSystem = function() {
	console.log("Iteration " + i)
	i++
	deliverMessage()
	// console.log(pendingMessages)
	servers.forEach(function(server) {
		receiveHeartbeat(server)
		checkHeartbeat(server)
	})
}

setInterval(runSystem, 1000)

var startViewChange = function() {
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

var handleVoteRequest = function() {
	// If this view_id > max,
	// send an Accept. Record max Viewid.
	// Become underling.
}

var awaitView = function() {
	// Check the status by waiting for a message
	// that has the max_viewid you recorded. => Become active
	// If election times out, then run a view
	// change yourself. 
	// If you receive an voteRequest for bigger view_id, accept it.
}

// server = createServer(1, 1, [2, 3, 4])
// var checkHeartbeat = function() {
// 	for (heart in server.heartBeats)
// 		if (server.heartBeats[heart] < $.now()) {
// 			console.log("Heartbeat to " + heart)
// 			server.heartBeats[heart] = $.now() + HEARTBEAT_TIMEOUT
// 		}
// 	setTimeout(checkHeartbeat, 500)
// }
// setTimeout(checkHeartbeat, 500)