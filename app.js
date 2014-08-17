// OSC Bridge by Javi Agenjo @tamat

var WebSocket = require('./node_modules/faye-websocket/lib/faye/websocket');

var fs        = require('fs'),
    http      = require('http'),
    https     = require('https'),
    qs		  = require('querystring'),
	osc		  = require('node-osc'),
    url		  = require('url');
var debug="development";
//input parameters
var pos = process.argv.indexOf("-port")
var port   = (pos != -1 && (process.argv.length > pos + 1) ? process.argv[pos+1] : 4343);
    secure = process.argv.indexOf("-ssl") != -1;
var verbose = (process.argv.indexOf("-v") != -1 ? true : false);
if(verbose) console.log("verbose mode ON");

var OSC_PORT = port + 1;

//Server 
var BroadcastServer = {
	clients: [],
	last_id: 1, //0 is reserved for server messages

	init: function()
	{
	},

	//NEW CLIENT
	onConnection: function(ws)
	{
		//initialize
		ws.user_id = this.last_id;
		this.last_id++;
		var path_info = url.parse(ws.url);
		var params = qs.parse(path_info.query);

		this.clients.push(ws);

		//ON MESSAGE CALLBACK
		ws.onmessage = function(event) {
			console.log(ws.ip + ' = ' + typeof(event.data) + "["+event.data.length+"]:" + event.data );
			console.dir(event.data); //like var_dump

			//this.send(...);
		};

		//ON CLOSE CALLBACK
		ws.onclose = function(event) {
			console.log('close', event.code, event.reason);
			BroadcastServer.clients.splice( BroadcastServer.clients.indexOf(ws), 1);
			ws = null;
		};
	},

	sendToAll: function(data, skip_id )
	{
		//broadcast
		for(var i in BroadcastServer.clients)
			if (BroadcastServer.clients[i].user_id != skip_id)
				BroadcastServer.clients[i].send(data);
	}
};

// OSC SERVER **********************************************

// so let's start to listen on OSC_PORT
console.log("OSC Server in port: " + OSC_PORT );
var OSCserver = new osc.Server(OSC_PORT, '127.0.0.1');
var messages_detected = {};
var _hue = 360;
var _brightness = 100;
var _saturate = 100;
OSCserver.on('message', function (args) {
	//client.send({ message: '/lp/scene ' + args });
	//console.log("msg! " + args);
	
	if(!messages_detected[args[0]])
	{
		if(args[0] == "#bundle")
		{
			for(var i = 2; i < args.length; i++)
			{
				var bundle_args = args[i];
				if(!messages_detected[bundle_args[0]])
				{
					if(verbose) console.log("New OSC msg detected: " + bundle_args[0]);
					messages_detected[ bundle_args[0] ] = true;
				}
				if(bundle_args[0]=='/color')
				{
					var hsbvals = rgb2hsb(bundle_args[1],bundle_args[2],bundle_args[3]);
					_hue = hsbvals[0];
				}
				if(bundle_args[0]=='/brightness')
				{
					_brightness = float2int(bundle_args[1]);
				}
				if(bundle_args[0]=='/saturate')
				{
					_saturate = float2int(bundle_args[1]);
				}
			}
		}
		else
		{
			if(verbose) console.log("New OSC msg detected: " + args[0]);
			messages_detected[ args[0] ] = true;
		}
	}
	if(verbose) console.dir(args);
	var myJSONValue = {hue:_hue,brightness:_brightness,saturate:_saturate};
	
	// BroadcastServer.sendToAll( args.toString() );
	var jsonData = JSON.stringify(myJSONValue)
	BroadcastServer.sendToAll(jsonData );
});


//create packet server
var connectionHandler = function(request, socket, head) {
	var ws = new WebSocket(request, socket, head, ['irc', 'xmpp'], {ping: 5});
	console.log('open', ws.url, ws.version, ws.protocol);
	BroadcastServer.onConnection(ws);
};

// HTTP SERVER  (used for administration) **********************
var staticHandler = function(request, response)
{
	var path = request.url;
	console.log("http request: " + path);

	function sendResponse(response,status_code,data)
	{
		// response.writeHead(status_code, {'Content-Type': 'text/plain', "Access-Control-Allow-Origin":"*"});
		// if( typeof(data) == "object")
		// 	response.write( JSON.stringify(data) );
		// else
		// 	response.write( data );
		// response.end();
        response.writeHeader(200, {"Content-Type": "text/html"});  
        response.write(data);  
        response.end();  
    	
	}
	if(path=="/")
	{
		if(debug=="development")
		{
			path = "/index_development.html"
		}
		else if(debug=="production")
		{
			path = "/index_production.html"
		}
	}
	fs.readFile(__dirname + path, function(err, content) {
		var status = err ? 404 : 200;

		sendResponse(response, status, content || "file not found");
	});
};

//Prepare server
BroadcastServer.init();

//create the server (if it is SSL then add the cripto keys)
var server = secure
           ? https.createServer({
               key:  fs.readFileSync(__dirname + '/../spec/server.key'),
               cert: fs.readFileSync(__dirname + '/../spec/server.crt')
             })
           : http.createServer();
server.addListener('request', staticHandler); //incoming http connections
server.addListener('upgrade', connectionHandler); //incomming websocket connections

//launch the server
console.log('WebSocket Server in port...', port);
server.listen(port);

//helper function

function rgb2hsb(r,g,b)
{
 var hue, saturation, brightness;
 // if (hsbvals == null) {
 //   hsbvals = new float[3];
 // }
 var cmax = (r > g) ? r : g;
 if (b > cmax) cmax = b;
 var cmin = (r < g) ? r : g;
 if (b < cmin) cmin = b;

 brightness = ( cmax) / 255;
 if (cmax != 0)
   saturation = ( (cmax - cmin)) / ( cmax);
 else
   saturation = 0;
 if (saturation == 0)
   hue = 0;
 else {
   var redc = ( (cmax - r)) / ( (cmax - cmin));
   var greenc = ( (cmax - g)) / ( (cmax - cmin));
   var bluec = ( (cmax - b)) / ( (cmax - cmin));
   if (r == cmax)
     hue = bluec - greenc;
   else if (g == cmax)
     hue = 2 + redc - bluec;
   else
     hue = 4 + greenc - redc;
   hue = hue / 6;
   if (hue < 0)
     hue = hue + 1;
 }
 var hsbvals = new Array(0,0,0);
 hsbvals[0] = float2int(hue*360);
 hsbvals[1] = float2int(saturation*100);
 hsbvals[2] = float2int(brightness*100);
 return hsbvals;

}
function float2int (value) {
    return value | 0;
}