import axios from "axios";

const isDev = window.location.port === "5173" || window.location.port === "3000";
const baseURL = isDev ? "http://localhost:5000/api/v1" : "/api/v1";

const api = axios.create({
  baseURL,
  withCredentials: true,
});

// Intercept unauthorized responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    return Promise.reject(error);
  }
);

export default api;
