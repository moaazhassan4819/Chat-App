import { useContext, useEffect } from "react";
import "./App.css";
import AuthPage from "./pages/AuthPage";
import { GlobalContext } from "./context/Context";
import api from "./component/api";
import { Navigate, Route, Routes } from "react-router-dom";
import ChatPage from "./pages/ChatPage";

function App() {
  const { state, dispatch } = useContext(GlobalContext);

  const checkUser = async () => {
    try {
      const apiRes = await api.get(`/me`);
      dispatch({ type: "USER_LOGIN", user: apiRes.data.user });
    } catch (error) {
      dispatch({ type: "USER_LOGOUT" });
    }
  };

  useEffect(() => {
    checkUser();
  }, []);

  if (state.isLogin === null) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
          color: "#e2e8f0",
          fontFamily: "sans-serif",
        }}
      >
        <p>Loading application...</p>
      </div>
    );
  }

  return (
    <div className="App">
      {state.isLogin ? (
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      ) : (
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      )}
    </div>
  );
}

export default App;
