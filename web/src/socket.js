import io from "socket.io-client";

const isDev = window.location.port === "5173" || window.location.port === "3000";
const SOCKET_URL = isDev ? "http://localhost:5000" : window.location.origin;

let socket = null;

export const getSocket = () => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      withCredentials: true,
      autoConnect: true,
      transports: ["websocket", "polling"],
    });
  }
  return socket;
};
