
window.onload = function() {

	servers.forEach(function(server)  {
		preElement = document.createElement("pre");
		preElement.id = server.mymid;
		document.body.appendChild(preElement);
	});
	var initialize

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
}
