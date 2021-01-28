const { create } = require('domain');

const app = require('express')();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Empty games object
var games = {};

// On a connection
io.on('connection', (socket) => {
  console.log('a user connected');

  socket.on('disconnect', () => {
    console.log("a user disconnected")
    disconnectUser(socket)
  });

  // When a player wants to start a new game
  socket.on('newGame', (data) => {
    // Create game code?
    let code = createCode();

    // make sure it is unique
    while (games[code]) {
      code = createCode();
    }

    // Add a new game
    games[code] = {
      "leader": socket.id,
      "letter": "",
      "users": [
        {
          "id": socket.id,
          "displayName": data.name,
          "score": 0,
          "ready": false
        }
      ]
    };

    // Join the game room
    socket.join(code);

    console.log("game created with code: " + code);
    console.log(games)

    // Broadcast code
    io.in(code).emit("gameCreated", {code: code, game: games[code]});
  });

  // When a player wants to join a game
  socket.on('joinGame', (data) => {
    // Make sure the provided game is actually a game
    console.log(games);
    if (games[data.code]) {
      // Make sure the same user isn't trying to join the room twice
      if (games[data.code].users.findIndex(x => x["id"] == socket.id) < 0) {
        // Join the room
        socket.join(data.code);
        // Update the user list
        games[data.code].users.push(
          {
            "id": socket.id,
            "displayName": data.name,
            "score": 0,
            "ready": false
          }
        );

        console.log("user joined room " + data.code + " with name " + data.name + " with id " + socket.id);
        console.log(games);

        io.in(data.code).emit("userJoined", {code: data.code, game: games[data.code]});
      } else {
        // TODO: IDK what to do here, its not name taken, its the user is in another room
        // Name taken
        io.to(socket.id).emit('nameTaken', "That name is already taken");

        console.log("someone tried to join room with name taken");
      }
    } else {
      // Invalid game
      io.to(socket.id).emit('invalidGame', "That game code does not exist");

      console.log("someone tried to join room that doesnt exist");
    }
  });

  // When a player updates the letter
  socket.on('newRandomLetter', (data) => {
    games[data.code].letter = data.letter;

    console.log("new letter picked: " + data.letter);
    console.log(games);

    io.in(data.code).emit('newRandomLetter', data.letter);
  });

  // When a play readys up
  socket.on('readyUp', (data) => {
    var index = games[data.code].users.findIndex(x => x["id"] == socket.id);
    if (index > -1) {
      // Mark them as ready
      games[data.code].users[index].ready = data.isReady;

      io.in(data.code).emit('readiedUp', {game: games[data.code]});
    }
  });

  // When a game is ready to start
  socket.on('startGame', (data) => {
    console.log("the game " + data.code + " has started using list number " + data.listNumber);

    io.in(data.code).emit('gameStarted', {game: games[data.code], listNumber: data.listNumber})
  });

  // When a new score is submitted
  socket.on('submittedScore', (data) => {
    var index = games[data.code].users.findIndex(x => x["id"] == socket.id);
    if (index > -1) {
      // Add the new score to the current score
      games[data.code].users[index].score += data.score;
      // Unready the user
      games[data.code].users[index].ready = false;

      console.log(games[data.code].users[index].displayName + " submitted a score of " + data.score)

      io.in(data.code).emit('scoreUpdate', {game: games[data.code]});
    }
  });
});

http.listen(3000, () => {
  console.log('listening on *:3000');
});

function createCode() {
  var code = "";
  for (i = 0; i < 4; i++) {
    let number = Math.floor(Math.random() * 26) + 65;
    let charFromNumber = String.fromCharCode(number);
    code = code + charFromNumber;
  }
  return code;
}

// Called when the user disconnects from server or starts a new room
function disconnectUser(socket) {
  // Find what game they are in
  for (game in games) {
    var index = games[game].users.findIndex(x => x["id"] == socket.id);
    if (index > -1) {
      console.log(games[game])
      console.log("user with name " + games[game].users[index].displayName + " left game " + game)
      // Save user id
      let idOfUserThatLeft = games[game].users[index].id

      // Remove them from the players list
      games[game].users.splice(index, 1);

      // If the person who left was the leader
      if (idOfUserThatLeft == games[game].leader) {
        // If there are still people in the game
        if (games[game].users.length > 0) {
          // Assign a new leader
          games[game].leader = games[game].users[0].id
        }
      }

      console.log(games[game])

      // Emit that someone left so UI can update
      io.in(game).emit("userDisconnected", {game: games[game]});
      // Remove the game if there are no users
      if (games[game].users.length == 0) {
        delete games[game];
        console.log("game " + game + " had no more players and was deleted")
      } else {
        // Want to let the user know someone disconnected and tell them to send the code again
        // io.to(game).emit('new', {name: game, board: games[game].board, players: 1,
        //   message: '<h3>A user has disconnected. Either start a new game, or give them this ID, <mark>'
        //   + game + '</mark>, to continue</h3>'})
      }
    }
  }
}