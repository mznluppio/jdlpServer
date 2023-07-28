const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 8080 });

console.log("Server listening on port 8080");

const players = {};
const rooms = [];
let currentRoom;

function shuffleArray(array) {
  // Algorithme de mélange de Fisher-Yates
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

wss.on("connection", (socket) => {
  let username;

  socket.on("message", (message) => {
    const data = JSON.parse(message);

    if (data.event === "setUsername") {
      username = data.username;
      sessionId = data.sessionId;
      players[username] = { socket, sessionId }; // Stocker l'objet socket avec le nom d'utilisateur
      console.log("Nouvel utilisateur:", username, "Session ID:", sessionId);
    }

    if (data.event === "createRoom") {
      const roomName = data.roomName;
      const createdBy = data.createdBy;
      const playersRoom = [data.createdBy];

      rooms.push({ roomName, createdBy, playersRoom });
      console.log("Nouvelle room:", roomName, createdBy, playersRoom);

      currentRoom = roomName;
    }

    if (data.event === "joinRoom") {
      const roomName = data.roomName;
      const usernamePlayer = data.username;

      // Check if the room exists
      const room = rooms.find((r) => r.roomName === roomName);

      if (room) {
        room.playersRoom.push(usernamePlayer);

        const playerJoinedEvent = JSON.stringify({
          event: "playerJoined",
          player: usernamePlayer,
        });

        rooms
          .filter((r) => r.roomName === roomName)
          .forEach((r) => {
            r.playersRoom
              .filter((p) => p !== usernamePlayer)
              .forEach((p) => {
                const player = players[p];
                if (player) {
                  player.socket.send(playerJoinedEvent);
                }
              });
          });

        // Send room data to the joining player
        const roomDataMessage = JSON.stringify({
          event: "getRoomDataResponse",
          playersRoom: room.playersRoom,
        });
        const joiningPlayerSocket = players[usernamePlayer]?.socket;
        if (joiningPlayerSocket) {
          joiningPlayerSocket.send(roomDataMessage);
        }

        // Broadcast the updated room data to all players in the room
        rooms
          .filter((r) => r.roomName === roomName)
          .forEach((r) => {
            r.playersRoom.forEach((player) => {
              const playerSocket = players[player]?.socket;
              if (playerSocket) {
                playerSocket.send(roomDataMessage);
              }
            });
          });

        socket.send(playerJoinedEvent);
      } else {
        // Notify the player that the room does not exist
        const roomNotFoundMessage = JSON.stringify({
          event: "roomNotFound",
          message: "The room does not exist.",
        });
        socket.send(roomNotFoundMessage);
      }
    }

    if (data.event === "getRooms") {
      const roomListMessage = JSON.stringify({ event: "roomList", rooms });
      socket.send(roomListMessage);
    }

    if (data.event === "getRoomData") {
      const roomName = data.roomName;
      const room = rooms.find((r) => r.roomName === roomName);

      if (room) {
        const roomDataMessage = JSON.stringify({
          event: "getRoomDataResponse",
          playersRoom: room.playersRoom,
        });
        console.log("Données que je vais envoyer", roomDataMessage);
        socket.send(roomDataMessage);
      }
    }

    if (data.event === "startGame") {
      const roomName = data.roomName;

      // Envoyer un message à tous les clients de la room pour leur indiquer de passer au composant Game
      const gameStartedMessage = JSON.stringify({ event: "gameStarted" });
      rooms
        .filter((r) => r.roomName === roomName)
        .forEach((r) => {
          r.playersRoom.forEach((player) => {
            const playerSocket = players[player]?.socket;
            if (playerSocket) {
              playerSocket.send(gameStartedMessage);
            }
          });
        });
    }

    if (data.event === "sendSong") {
      const roomName = data.roomName;
      const selectedSongs = data.selectedSongs;
      const sessionId = data.sessionId;
      let username = "Unknown Player";

      // Find the username based on the session ID
      for (const player in players) {
        if (players[player].sessionId === sessionId) {
          username = player;
          break;
        }
      }

      const room = rooms.find((r) => r.roomName === roomName);
      if (room) {
        room.songs = room.songs || {};
        const songsWithPlayer = selectedSongs.map((song) => ({
          ...song,
          player: username,
          sessionId: sessionId,
        }));
        room.songs[sessionId] = songsWithPlayer;

        if (Object.keys(room.songs).length === room.playersRoom.length) {
          const allPlayersSubmittedMessage = JSON.stringify({
            event: "allPlayersSubmitted",
          });
          rooms
            .filter((r) => r.roomName === roomName)
            .forEach((r) => {
              r.playersRoom.forEach((player) => {
                const playerSocket = players[player]?.socket;
                if (playerSocket) {
                  playerSocket.send(allPlayersSubmittedMessage);
                }
              });
            });

          const songsArray = Object.values(room.songs).flat();
          const shuffledSongs = songsArray.sort(() => Math.random() - 0.5);
          const roomSongsMessage = JSON.stringify({
            event: "roomSongs",
            songs: shuffledSongs,
          });
          rooms
            .filter((r) => r.roomName === roomName)
            .forEach((r) => {
              r.playersRoom.forEach((player) => {
                const playerSocket = players[player]?.socket;
                if (playerSocket) {
                  playerSocket.send(roomSongsMessage);
                }
              });
            });
        }
      }

      console.log("Songs received from", username);
    }

    if (data.event === "nextSong") {
      const roomName = data.roomName;
      const songIndex = data.songIndex;

      const roomsToUpdate = rooms.filter((r) => r.roomName === roomName);
      roomsToUpdate.forEach((r) => {
        // Update the song progress for the player who sent the nextSong event
        const currentPlayerSessionId = data.sessionId;
        r.songs = r.songs || {};
        if (r.songs[currentPlayerSessionId]) {
          r.songs[currentPlayerSessionId].forEach((song) => {
            if (song.currentSongIndex === songIndex) {
              song.currentSongIndex += 1; // Move to the next song for the player
            }
          });
        }

        // Check if all players have played all songs
        const allSongsPlayed = r.playersRoom.every((player) => {
          const playerSongs = r.songs[player];
          return (
            playerSongs &&
            playerSongs.every(
              (song) => song.currentSongIndex === song.totalSongs - 1
            )
          );
        });

        if (allSongsPlayed) {
          const endGameMessage = JSON.stringify({ event: "endGame" });
          r.playersRoom.forEach((player) => {
            const playerSocket = players[player]?.socket;
            if (playerSocket) {
              playerSocket.send(endGameMessage);
            }
          });
          console.log("All songs have been played. Sending 'endGame' event.");
        }
      });

      // Broadcast the nextSong event to all clients in the room
      const nextSongMessage = JSON.stringify({ event: "nextSong", songIndex });
      roomsToUpdate.forEach((r) => {
        r.playersRoom.forEach((player) => {
          const playerSocket = players[player]?.socket;
          if (playerSocket) {
            playerSocket.send(nextSongMessage);
          }
        });
      });
    }

    if (data.event === "revealPlayer") {
      const roomName = data.roomName;

      const revealPlayerMessage = JSON.stringify({
        event: "revealPlayer",
      });

      // Broadcast the revealPlayer event to all clients in the room
      rooms
        .filter((r) => r.roomName === roomName)
        .forEach((r) => {
          r.playersRoom.forEach((player) => {
            const playerSocket = players[player]?.socket;
            if (playerSocket) {
              playerSocket.send(revealPlayerMessage);
            }
          });
        });
    }
    if (data.event === "hidePlayer") {
      const roomName = data.roomName;

      const hidePlayerMessage = JSON.stringify({
        event: "hidePlayer",
      });

      // Broadcast the hidePlayer event to all clients in the room
      rooms
        .filter((r) => r.roomName === roomName)
        .forEach((r) => {
          r.playersRoom.forEach((player) => {
            const playerSocket = players[player]?.socket;
            if (playerSocket) {
              playerSocket.send(hidePlayerMessage);
            }
          });
        });
    }
  });

  socket.on("close", () => {

    if (currentRoom) {
      const roomIndex = rooms.findIndex((r) => r.roomName === currentRoom);
      if (roomIndex !== -1) {
        rooms[roomIndex].playersRoom = rooms[roomIndex].playersRoom.filter(
          (player) => player !== username
        );

        if (rooms[roomIndex].playersRoom.length === 0) {
          rooms.splice(roomIndex, 1);
          console.log("Room supprimée:", currentRoom);
        } else {
          // Vérifier si le joueur qui quitte la room est présent dans playersRoom
          if (rooms[roomIndex].playersRoom.includes(username)) {
                        room.playersRoom = room.playersRoom.filter((player) => player !== username);

            console.log("Joueur quittant la room:", username);
          }
        }
      }
    }
  });
});
