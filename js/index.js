const fs = require("fs");
const url = require("url");
const http = require("http");
const https = require("https");
const querystring = require("querystring");
const { client_id, client_secret, scope } = require("../auth/credentials.json");

const host = "localhost";
const port = 3000;
const localserver = http.createServer();
const redirect_uri = "http://localhost:3000/callback";


localserver.on("request", request_handler);


function request_handler(request, response) {
    console.log(`New Request from ${request.socket.remoteAddress} for ${request.url}`);
    if (request.url === "/") {
        const form = fs.createReadStream("../html/index.html");
        response.writeHead(200, {
            "Content-Type": "text/html"
        });
        form.pipe(response);

    }
    else if (request.url === "/favicon.ico") {
        const img = fs.createReadStream("../images/favicon.ico");
        response.writeHead(200, {
            "Content-Type": "image/png"
        });
        img.pipe(response);
    }
    else if (request.url === "/images/spotifylogo.png") {
        const img = fs.createReadStream("../images/spotifylogo.png");
        response.writeHead(200, {
            "Content-Type": "image/png"
        });
        img.pipe(response);
    }
    else if (request.url.startsWith("/login")) {
        redirect_to_spotify_auth(request, response);
    }
    else if (request.url.startsWith("/callback")) {
        receive_code(request, response);
    }  
    else {
        not_found(response);
    }

}
localserver.on("listening", listen_handler);
localserver.listen(port);



function listen_handler() {
    console.log(`Now Listening on Port ${port}`);
    console.log(localserver.address());
}

function not_found(response) {
    response.writeHead(404, {
        "Content-Type": "text/html"
    }).end("404 Not Found");
}

function redirect_to_spotify_auth(request, response) {
    const spotifyauth = "https://accounts.spotify.com/authorize";
    let response_type = "code"
    let uri = querystring.stringify({client_id, scope, redirect_uri, response_type});
    response.writeHead(302, {
        Location: `${spotifyauth}?${uri}`
    }).end();
}

function receive_code(request, response) {
    const codewrapper = url.parse(request.url, true).query;
    request_token(codewrapper.code, response);
}

function request_token(code, response) {
    const tokenlink = "https://accounts.spotify.com/api/token";
    let auth_token_time = new Date();
    const grant_type = "authorization_code";
    const post_data = querystring.stringify({ grant_type, code, redirect_uri });
    let base64data = Buffer.from(`${client_id}:${client_secret}`).toString('base64');
    let options = {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": `Basic ${base64data}`
        }
    }
    https.request(tokenlink, options, (token_stream) => process_stream(token_stream, receive_token, response)).end(post_data);

}


function process_stream(stream, callback, ...args) {
    let body = "";
    stream.on("data", chunk => body += chunk);
    stream.on("end", () => callback(body, ...args));
}

function receive_token(token, response) {
    let spotify_auth = JSON.parse(token);
    let access_token = spotify_auth.access_token;
    make_request_for_recently_played(access_token, response);
}

function make_request_for_recently_played(access_token, response){
    const endpoint = "https://api.spotify.com/v1/me/player/recently-played";
    let options = {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${access_token}`
        }
    }
    https.request(endpoint, options, (recently_played_stream) => process_stream(recently_played_stream, getArtistNames, response)).end();
}

function getArtistNames(recently_played_stream, response){
    const recent = recently_played_stream;
    let parsed = JSON.parse(recent);
    let artistName = parsed.items[0].track.album.artists[0].name;
    
    send_to_tastedive_api(artistName, response);
}

function send_to_tastedive_api(artistName, response){
    let key = "393642-MusicRec-090N2LOM";
    let tasteAPIrequest = `https://tastedive.com/api/similar?q=${artistName}&k=${key}`;
    https.request(tasteAPIrequest, (rec_stream) => process_stream(rec_stream, receive_rec, artistName, response)).end();
}

function receive_rec(rec_stream, artistName, response){
    let recommendations = JSON.parse(rec_stream);
    let rec_arr = [];
    console.log(`Most recently played artist: ${artistName}`);
    for(var i = 0; i < 5; i++){
        rec_arr.push(recommendations.Similar.Results[i].Name);
        console.log(recommendations.Similar.Results[i].Name);
    }
    generate_webpage(artistName, rec_arr, response);
}

function generate_webpage(artistName, rec_arr, response){
    response.writeHead(200, {
        "Content-Type": "text/html",
    });
    response.end(`Based on your listening history, you recently listened to ${artistName}, \nhere are some artists you also might enjoy: ${rec_arr[0]}, ${rec_arr[1]}, ${rec_arr[2]}, ${rec_arr[3]}, ${rec_arr[4]}`);
}