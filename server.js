const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 8080 });
console.log("Server listening on port 8080");

const players = {};
const rooms = new Map();

wss.on("connection", (socket) => {
  let username;
  let currentRoom;

  socket.on("message", (message) => {
    const data = JSON.parse(message);

    switch (data.event) {
      case "setUsername": {
        username = data.username;
        const sessionId = data.sessionId;
        players[username] = { socket, sessionId };
        console.log("Nouvel utilisateur:", username, "Session ID:", sessionId);
        break;
      }

      case "createRoom": {
        if (!username) {
          console.error("User must set username before creating a room.");
          break;
        }

        const { roomName, createdBy } = data;
        const playersRoom = [createdBy];
        rooms.set(roomName, { roomName, createdBy, playersRoom, songs: {} });
        console.log("Nouvelle room:", roomName, createdBy, playersRoom);
        currentRoom = roomName;
        break;
      }

      case "joinRoom": {
        if (!username) {
          console.error("User must set username before joining a room.");
          break;
        }

        const { roomName } = data;
        const room = rooms.get(roomName);

        if (room) {
          if (room.playersRoom.includes(username)) {
            console.error("User is already in the room.");
            break;
          }

          room.playersRoom.push(username);

          const playerJoinedEvent = JSON.stringify({
            event: "playerJoined",
            player: username,
          });

          room.playersRoom
            .filter((p) => p !== username)
            .forEach((p) => {
              const player = players[p];
              if (player) {
                player.socket.send(playerJoinedEvent);
              }
            });

          const roomDataMessage = JSON.stringify({
            event: "getRoomDataResponse",
            playersRoom: room.playersRoom,
          });

          const joiningPlayerSocket = players[username]?.socket;
          if (joiningPlayerSocket) {
            joiningPlayerSocket.send(roomDataMessage);
          }

          room.playersRoom.forEach((player) => {
            const playerSocket = players[player]?.socket;
            if (playerSocket) {
              playerSocket.send(roomDataMessage);
            }
          });

          socket.send(playerJoinedEvent);
        } else {
          const roomNotFoundMessage = JSON.stringify({
            event: "roomNotFound",
            message: "The room does not exist.",
          });
          socket.send(roomNotFoundMessage);
        }
        break;
      }

      case "getRooms": {
        const roomListMessage = JSON.stringify({
          event: "roomList",
          rooms: Array.from(rooms.values()).map(({ roomName, createdBy, playersRoom }) => ({
            roomName,
            createdBy,
            playersCount: playersRoom.length,
          })),
        });
        socket.send(roomListMessage);
        break;
      }

      case "getRoomData": {
        const { roomName } = data;
        const room = rooms.get(roomName);

        if (room) {
          const roomDataMessage = JSON.stringify({
            event: "getRoomDataResponse",
            playersRoom: room.playersRoom,
          });
          console.log("Données que je vais envoyer", roomDataMessage);
          socket.send(roomDataMessage);
        }
        break;
      }

      case "startGame": {
        const { roomName } = data;
        const gameStartedMessage = JSON.stringify({ event: "gameStarted" });
        const room = rooms.get(roomName);

        if (room) {
          room.playersRoom.forEach((player) => {
            const playerSocket = players[player]?.socket;
            if (playerSocket) {
              playerSocket.send(gameStartedMessage);
            }
          });
        }
        break;
      }

      case "sendSong": {
        const { roomName, selectedSongs, sessionId } = data;
        let username = "Unknown Player";

        for (const player in players) {
          if (players[player].sessionId === sessionId) {
            username = player;
            break;
          }
        }

        const room = rooms.get(roomName);
        if (room) {
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
            room.playersRoom.forEach((player) => {
              const playerSocket = players[player]?.socket;
              if (playerSocket) {
                playerSocket.send(allPlayersSubmittedMessage);
              }
            });

            const songsArray = Object.values(room.songs).flat();
            const shuffledSongs = songsArray.sort(() => Math.random() - 0.5);
            const roomSongsMessage = JSON.stringify({
              event: "roomSongs",
              songs: shuffledSongs,
            });
            room.playersRoom.forEach((player) => {
              const playerSocket = players[player]?.socket;
              if (playerSocket) {
                playerSocket.send(roomSongsMessage);
              }
            });
          }
        }

        console.log("Songs received from", username);
        break;
      }

      case "nextSong": {
        const { roomName, songIndex, sessionId } = data;
        const roomsToUpdate = Array.from(rooms.values()).filter(
          (r) => r.roomName === roomName
        );

        roomsToUpdate.forEach((room) => {
          const currentPlayerSongs = room.songs[sessionId];
          if (currentPlayerSongs) {
            currentPlayerSongs.forEach((song) => {
              if (song.currentSongIndex === songIndex) {
                song.currentSongIndex += 1;
              }
            });
          }

          const allSongsPlayed = room.playersRoom.every((player) => {
            const playerSongs = room.songs[player];
            return (
              playerSongs &&
              playerSongs.every((song) => song.currentSongIndex === song.totalSongs - 1)
            );
          });

          if (allSongsPlayed) {
            const endGameMessage = JSON.stringify({ event: "endGame" });
            room.playersRoom.forEach((player) => {
              const playerSocket = players[player]?.socket;
              if (playerSocket) {
                playerSocket.send(endGameMessage);
              }
            });
            console.log("All songs have been played. Sending 'endGame' event.");
          }

          const nextSongMessage = JSON.stringify({ event: "nextSong", songIndex });
          room.playersRoom.forEach((player) => {
            const playerSocket = players[player]?.socket;
            if (playerSocket) {
              playerSocket.send(nextSongMessage);
            }
          });
        });
        break;
      }

      case "revealPlayer": {
        const { roomName } = data;
        const revealPlayerMessage = JSON.stringify({
          event: "revealPlayer",
        });

        const room = rooms.get(roomName);
        if (room) {
          room.playersRoom.forEach((player) => {
            const playerSocket = players[player]?.socket;
            if (playerSocket) {
              playerSocket.send(revealPlayerMessage);
            }
          });
        }
        break;
      }

      case "hidePlayer": {
        const { roomName } = data;
        const hidePlayerMessage = JSON.stringify({
          event: "hidePlayer",
        });

        const room = rooms.get(roomName);
        if (room) {
          room.playersRoom.forEach((player) => {
            const playerSocket = players[player]?.socket;
            if (playerSocket) {
              playerSocket.send(hidePlayerMessage);
            }
          });
        }
        break;
      }
    }
  });

  socket.on("close", () => {
    if (username && currentRoom) {
      const room = rooms.get(currentRoom);
      if (room) {
        room.playersRoom = room.playersRoom.filter((player) => player !== username);
        if (room.playersRoom.length === 0) {
          rooms.delete(currentRoom);
          console.log("Room supprimée:", currentRoom);
        } else {
          if (room.playersRoom.includes(username)) {
            console.log("Joueur quittant la room:", username);
          }
        }
      }
    }

    delete players[username];
  });
});
