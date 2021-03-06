
var showTimeouts = false;
var showHeartbeats = true;
var initializeDraw = function() {
	$("#stop_button").click(function(e) {
		if (stop) {
			servers.forEach(function(server) {
				server.inHeartbeats.forEach(function(time, k, map){
					map.set(k, time + $.now() - stopTime);
				});
				server.outHeartbeats.forEach(function(time, k, map){
					map.set(k, time + $.now() - stopTime);
				});
				server.electionEnd += $.now() - stopTime;
				server.retryTime += $.now() - stopTime;
			});

			client.timeout += $.now() - stopTime;
			client.firstAttemptTime += $.now() - stopTime;
		}

		stop = !stop;
		stopTime = (stop) ? $.now() : null;
		$(this).text((stop) ? "Resume" : "Pause");
	});


	$('#show_timeouts').click(function(e) {
		showTimeouts = !showTimeouts;
		$(this).text((showTimeouts) ? "Show Log" : "Show Timeouts")
	});

	$('#show_heartbeats').click(function(e){
		showHeartbeats = !showHeartbeats;
		$('.heart').css("display", (showHeartbeats) ? "initial" : "none");
		$(this).text((showHeartbeats) ? "Hide Heartbeats" : "Show Heartbeats")
	});

	servers.forEach(function(server)  {
		var preElement = document.createElement("pre");
		preElement.id = server.mymid;
		preElement.style.display = "inline-block"
		$("#container").append(preElement);
		var button = document.createElement("button");
		button.id = "kill-" + server.mymid;
		button.textContent = "Kill " + server.mymid; 
		button.addEventListener("click", function(e) {
			if (server.status == "stop") {
				server.status = "crashed";
				button.textContent = "Kill " + server.mymid;
			}
			else {
				server.status = "stop";
				button.textContent = "Revive " + server.mymid;
			}
		});
		$("#buttons").append(button)
		// var iter = document.createElement("pre");
		
		// document.body.appendChild(button);
	});
	var preElement = document.createElement("pre");
	preElement.id = client.mymid;
	$(preElement).insertAfter("#messageArea");
	preElement.style.position = "absolute";

}

var makeTable = function(title, xLabel, yLabel, startIndex, map, xExtractor, yExtractor, bodyMap) {
	var j = startIndex;
	bodyMap[j] = title;
	j++;
	bodyMap[j] = " " + xLabel + " | " + yLabel;
	j++;
	bodyMap[j] = " ------------";
	j++;
	var prefix = "    ";
	map.forEach(function(y, x) {
		bodyMap[j] = prefix + xExtractor(x) + " | " + yExtractor(y);
		j += 1;
	});
};

var makeLog = function(xLabel, yLabel, startIndex, log, limit, bodyMap) {
	var j = startIndex;

	j++;
	bodyMap[j] = "    " + xLabel + "  | " + yLabel;
	j++;
	bodyMap[j] = " ---------------------";
	j++;
	var prefix = "     ";
	log.forEach(function(ele, i) {
		if (i < log.length - limit)
			return;

		var extra = (typeof ele.aid !== 'undefined') ? " TXN" + ele.aid : "";

		bodyMap[j] = ((typeof ele.viewid !== 'undefined') ? ("(" + ele.viewid + ") " + ele.ts) : "    -  ") + " | " + ele.operation + extra;
		j += 1;
	});
};

var normalizeTime = function(time) {
	return (time - $.now()) / 1000;
};

var drawServer = function(len, server) {
	if (server.status == "active" && server.cur_view.primary == server.mymid) {
		$('#' + server.mymid).css({"background-color": "bisque"});
	} else if (server.status == "stop" || server.status == "crashed"){
		$('#' + server.mymid).css({"background-color": "LightGray"});
	} else {
		$('#' + server.mymid).css({"background-color": "white"});
	}


	var firstLine = " ";
	for (var i = 0; i < len-2; i++) {
		firstLine += "-";
	}
	firstLine += " \n";

	var body = "";
	var bodyMap = {
					0: "ID: " + server.mymid + ((server.mymid !== server.cur_view.primary || server.status !== "active") ? "" : " - Primary"),
					1: "Status: " + server.status,  
				   	2: "Cur View: (" + server.cur_viewid[0] + ", " + server.cur_viewid[1] + ")",
				   	3: "Max View: (" + server.max_viewid[0] + ", " + server.max_viewid[1] + ")",
				};

	if (server.status == "active") {
		if (!showTimeouts)
			makeLog("VS", "Log Entry", 5, server.log, 5, bodyMap)
		else {
			var xExtractor = function(x) { return x; };
			var timeExtractor = function(time) { return normalizeTime(time) + "s"; };
			makeTable("Heartbeat Timeouts", "Peer", "Time", 5, server.inHeartbeats, xExtractor, timeExtractor, bodyMap);
		}
	}

	if (server.status == "view_manager") {
		j = 5;
		bodyMap[j] = "Election Ends: " + normalizeTime(server.electionEnd) + "s";

		var xExtractor = function(x) { return x; };
		var inviteExtractor = function(acceptance) {
			if (acceptance != null) {
				return "yes";
			}
			return "not yet";
		};
		makeTable("Invitations", "peer", "accepted?", j + 1, server.invitations, xExtractor, inviteExtractor, bodyMap);
	}

	if (server.status == "underling") {
		j = 5;
		bodyMap[j] = "Election Ends: " + normalizeTime(server.electionEnd) + "s";
	}

	for (i = 0; i < (len/2)-2; i++) {
		body += "|";
		var inserted = "";
		if (bodyMap[i])
			inserted = bodyMap[i]

		body += inserted
		for (var j = inserted.length; j < len-2; j++)
			body += " ";
		body += "|\n";
	}

	document.getElementById(server.mymid).innerHTML = firstLine + body + firstLine;
}

window.drawServer = drawServer;

var drawClient = function(len, client) {

	var firstLine = " ";
	for (var i = 0; i < len-2; i++) {
		firstLine += "-";
	}
	firstLine += " \n";

	var body = "";
	var bodyMap = {
					0: "Client - ID: " + client.mymid ,
					1: "Status: " + client.status,  
				   	2: "Last Txn: " + client.lastTransaction,
				   	3: "Last View: (" + client.viewid  + ")"
				};

	makeLog("VS", "Log Entry", 5, client.log, 5, bodyMap)

	for (i = 0; i < (len/2)-2; i++) {
		body += "|";
		var inserted = "";
		if (bodyMap[i])
			inserted = bodyMap[i]

		body += inserted
		for (var j = inserted.length; j < len-2; j++)
			body += " ";
		body += "|\n";
	}

	document.getElementById(client.mymid).innerHTML = firstLine + body + firstLine;
	var serverWidth = $("#0").width()
	var containerWidth = serverWidth * (NUM_SERVERS)
	$("#" + NUM_SERVERS).css({'left': ((containerWidth/2) - serverWidth/2) +"px"});
}

window.drawClient = drawClient;