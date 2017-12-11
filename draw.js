
var initializeDraw = function() {
	$("#stop_button").click(function(e) {
		stop = !stop;
		$(this).text((stop) ? "Resume" : "Pause");
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
				server.status = "active";
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
	preElement.style.setProperty('left', 330 + "px");

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

var normalizeTime = function(time) {
	return (time - $.now()) / 1000;
};

var drawServer = function(len, server) {
	var firstLine = " ";
	for (var i = 0; i < len-2; i++) {
		firstLine += "-";
	}
	firstLine += " \n";

	var body = "";
	var bodyMap = {
					0: "ID: " + server.mymid + ((server.mymid !== server.cur_view.primary) ? "" : " - Primary"),
					1: "Status: " + server.status,  
				   	2: "Cur View: (" + server.cur_viewid[0] + ", " + server.cur_viewid[1] + ")",
				   	3: "Max View: (" + server.max_viewid[0] + ", " + server.max_viewid[1] + ")",
				};

	if (server.status == "active") {
		var xExtractor = function(x) { return x; };
		var timeExtractor = function(time) { return normalizeTime(time) + "s"; };
		makeTable("Heartbeats", "peer", "time", 5, server.inHeartbeats, xExtractor, timeExtractor, bodyMap);
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
				};

	// if (server.status == "active") {
	// 	var xExtractor = function(x) { return x; };
	// 	var timeExtractor = function(time) { return normalizeTime(time) + "s"; };
	// 	makeTable("Heartbeats", "peer", "time", 5, server.inHeartbeats, xExtractor, timeExtractor, bodyMap);
	// }

	// if (server.status == "view_manager") {
	// 	j = 5;
	// 	bodyMap[j] = "Election Ends: " + normalizeTime(server.electionEnd) + "s";

	// 	var xExtractor = function(x) { return x; };
	// 	var inviteExtractor = function(acceptance) {
	// 		if (acceptance != null) {
	// 			return "yes";
	// 		}
	// 		return "not yet";
	// 	};
	// 	makeTable("Invitations", "peer", "accepted?", j + 1, server.invitations, xExtractor, inviteExtractor, bodyMap);
	// }

	// if (server.status == "underling") {
	// 	j = 5;
	// 	bodyMap[j] = "Election Ends: " + normalizeTime(server.electionEnd) + "s";
	// }

	for (i = 0; i < (len/3)-2; i++) {
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
}

window.drawClient = drawClient;