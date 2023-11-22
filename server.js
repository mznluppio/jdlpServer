const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 8080 });

console.log("Server listening on port 8080");

const players = {};
const rooms = [];
let currentRoom;

wss.on("connection", (socket) => {
  let username;

  socket.on("message", (message) => {

    let data = {}

    try {
      data = JSON.parse(message);
    } catch (error) {
      return error;
    }

    if (data.event === "setUsername") {
      username = data.username;
      sessionId = data.sessionId;
      players[username] = { socket, sessionId };
    }

    if (data.event === "createRoom") {
      const roomName = data.roomName;
      const createdBy = data.createdBy;
      const playersRoom = [data.createdBy];
      rooms.push({ roomName, createdBy, playersRoom });
      currentRoom = roomName;
    }

    if (data.event === "joinRoom") {
      const roomName = data.roomName;
      const usernamePlayer = data.username;
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

        const roomDataMessage = JSON.stringify({
          event: "getRoomDataResponse",
          playersRoom: room.playersRoom,
        });
        const joiningPlayerSocket = players[usernamePlayer]?.socket;
        if (joiningPlayerSocket) {
          joiningPlayerSocket.send(roomDataMessage);
        }

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
        socket.send(roomDataMessage);
      }
    }

    if (data.event === "startGame") {
      const roomName = data.roomName;
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
    }

    if (data.event === "nextSong") {
      const roomName = data.roomName;
      const songIndex = data.songIndex;

      const roomsToUpdate = rooms.filter((r) => r.roomName === roomName);
      roomsToUpdate.forEach((r) => {
        const currentPlayerSessionId = data.sessionId;
        r.songs = r.songs || {};
        if (r.songs[currentPlayerSessionId]) {
          r.songs[currentPlayerSessionId].forEach((song) => {
            if (song.currentSongIndex === songIndex) {
              song.currentSongIndex += 1;
            }
          });
        }

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
        }
      });

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
          if (rooms[roomIndex].playersRoom.includes(username)) {
            room.playersRoom = room.playersRoom.filter((player) => player !== username);
          }
        }
      }
    }
  });
});
