import { useContext, useState } from "react";
import { GlobalContext } from "../context/Context";
import api from "../component/api";

function AuthPage() {
  const { dispatch } = useContext(GlobalContext);
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  function changeMode(nextMode) {
    setMode(nextMode);
    setError("");
    setNotice("");
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (mode === "signup") {
        const result = await api.post("/signup", form);
        setNotice(result.data?.message || "Account created! You can now sign in.");
        setMode("login");
      } else {
        const apiRes = await api.post("/login", {
          email: form.email,
          password: form.password,
        });
        dispatch({ type: "USER_LOGIN", user: apiRes.data.user });
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      {/* Left Branding Aside */}
      <section className="auth-aside">
        <div className="brand-lockup">
          <span className="brand-mark">c</span>
          <span>chat.io</span>
        </div>
        <div className="aside-copy">
          <span className="eyebrow" style={{ color: "#38bdf8" }}>YOUR PEOPLE, RIGHT HERE</span>
          <h1>Good conversations<br />start close.</h1>
          <p>A fast, modern space to chat in real-time with people you care about.</p>
        </div>
        <div className="aside-note">
          <span className="note-dot" /> Just you and your people
        </div>
        <div className="orbit orbit-one" />
        <div className="orbit orbit-two" />
      </section>

      {/* Right Form Main Area */}
      <section className="auth-main">
        <div className="auth-mobile-brand">
          <span className="brand-mark">c</span>
          <span>chat.io</span>
        </div>

        <div className="auth-box">
          <div className="auth-heading">
            <span className="eyebrow">{mode === "login" ? "WELCOME BACK" : "JOIN US"}</span>
            <h2>{mode === "login" ? "Sign in" : "Create account"}</h2>
            <p>
              {mode === "login"
                ? "Pick up where your conversations left off."
                : "Create an account and connect instantly."}
            </p>
          </div>

          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              className={mode === "login" ? "active" : ""}
              onClick={() => changeMode("login")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === "signup" ? "active" : ""}
              onClick={() => changeMode("signup")}
            >
              Create account
            </button>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {mode === "signup" && (
              <div className="name-fields">
                <label>
                  First name
                  <input
                    autoComplete="given-name"
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Last name
                  <input
                    autoComplete="family-name"
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    required
                  />
                </label>
              </div>
            )}

            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@example.com"
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="At least 6 characters"
                required
              />
            </label>

            {error && <p className="form-message error-message">{error}</p>}
            {notice && <p className="form-message success-message">{notice}</p>}

            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? "Please wait..." : mode === "login" ? "Sign in →" : "Create account →"}
            </button>
          </form>

          <p className="auth-footnote">By continuing, you agree to keep the conversation kind.</p>
        </div>

        <div className="auth-copyright">CHAT.IO · A MODERN REAL-TIME CHAT EXPERIENCE</div>
      </section>
    </main>
  );
}

export default AuthPage;
