import { useContext, useEffect, useRef, useState } from "react";
import api from "../component/api";
import { GlobalContext } from "../context/Context";
import { getSocket } from "../socket";

function initials(person) {
  return `${person?.firstName?.[0] || ""}${person?.lastName?.[0] || ""}`.toUpperCase() || "?";
}

function displayName(person) {
  return [person?.firstName, person?.lastName].filter(Boolean).join(" ") || "Unknown user";
}

function formatTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function Avatar({ person, small = false }) {
  const palette = ["mint", "coral", "blue", "gold", "lilac"];
  const tone = palette[(person?.firstName?.charCodeAt(0) || 0) % palette.length];
  return (
    <span className={`avatar avatar-${tone}${small ? " avatar-small" : ""}`} aria-hidden="true">
      {initials(person)}
    </span>
  );
}

function ChatPage() {
  const { state, dispatch } = useContext(GlobalContext);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());
  const [isTyping, setIsTyping] = useState(false);

  const endOfMessages = useRef(null);
  const typingTimeoutRef = useRef(null);
  const selectedUserRef = useRef(selectedUser);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  // Connect and listen to socket events
  useEffect(() => {
    if (!state.user?._id) return;
    const socket = getSocket();

    socket.emit("join_user", state.user._id);

    const handleUserStatus = (data) => {
      if (data?.onlineUsers) {
        setOnlineUserIds(new Set(data.onlineUsers.map(String)));
      }
    };

    const handleNewMessage = (newMsg) => {
      const senderId = (newMsg.from?._id || newMsg.from)?.toString();
      const receiverId = (newMsg.to?._id || newMsg.to)?.toString();
      const currentSelected = selectedUserRef.current?._id?.toString();

      // If message belongs to active chat session
      if (
        currentSelected &&
        (senderId === currentSelected || receiverId === currentSelected)
      ) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === newMsg._id)) return prev;
          return [...prev, newMsg];
        });
      }
    };

    const handleTypingStatus = (data) => {
      const currentSelected = selectedUserRef.current?._id?.toString();
      if (currentSelected && data.senderId === currentSelected) {
        setIsTyping(Boolean(data.isTyping));
      }
    };

    socket.on("user_status", handleUserStatus);
    socket.on("new_message", handleNewMessage);
    socket.on("typing_status", handleTypingStatus);

    return () => {
      socket.off("user_status", handleUserStatus);
      socket.off("new_message", handleNewMessage);
      socket.off("typing_status", handleTypingStatus);
    };
  }, [state.user?._id]);

  // Fetch users
  const getUsers = async () => {
    setLoadingUsers(true);
    try {
      const apiRes = await api.get("/users");
      setUsers(apiRes.data.users || []);
    } catch (err) {
      console.error("Error fetching users:", err);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    getUsers();
  }, []);

  // Fetch conversation when a user is selected
  const getConversation = async (user) => {
    if (!user?._id) return;
    setLoadingMessages(true);
    setError("");
    try {
      const apiRes = await api.get(`/conversation/${user._id}`);
      setMessages(apiRes.data.conversations || []);

      // Join socket chat room
      const socket = getSocket();
      socket.emit("join_chat", {
        senderId: state.user._id,
        receiverId: user._id,
      });
    } catch (err) {
      console.error("Error fetching messages:", err);
      setError("Could not load messages.");
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (!selectedUser) return;
    getConversation(selectedUser);
  }, [selectedUser]);

  useEffect(() => {
    endOfMessages.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isTyping]);

  // Handle typing status notification
  const handleDraftChange = (e) => {
    const val = e.target.value;
    setDraft(val);

    if (!selectedUser) return;
    const socket = getSocket();
    socket.emit("typing", {
      senderId: state.user._id,
      receiverId: selectedUser._id,
      isTyping: true,
    });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing", {
        senderId: state.user._id,
        receiverId: selectedUser._id,
        isTyping: false,
      });
    }, 1500);
  };

  // Send message
  async function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !selectedUser || sending) return;

    setSending(true);
    setError("");

    // Stop typing indicator immediately
    const socket = getSocket();
    socket.emit("typing", {
      senderId: state.user._id,
      receiverId: selectedUser._id,
      isTyping: false,
    });

    try {
      const apiRes = await api.post(`/chat/${selectedUser._id}`, { message: text });
      setDraft("");
      const sentChat = apiRes.data.chat;
      setMessages((prev) => {
        if (prev.some((m) => m._id === sentChat._id)) return prev;
        return [...prev, sentChat];
      });
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  // Logout handler
  const handleLogout = async () => {
    try {
      await api.post("/logout");
    } catch (e) {
      console.log(e);
    }
    dispatch({ type: "USER_LOGOUT" });
  };

  const filteredUsers = users.filter(
    (person) =>
      displayName(person).toLowerCase().includes(search.toLowerCase()) ||
      person.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main className={`chat-app${mobileChatOpen ? " mobile-chat-open" : ""}`}>
      {/* Sidebar - Users */}
      <aside className="people-panel">
        <div className="sidebar-top">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="brand-lockup">
              <span className="brand-mark">c</span>
              <span>chat.io</span>
            </div>
            <button
              onClick={handleLogout}
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "#e2e8f0",
                fontSize: "0.75rem",
                padding: "4px 8px",
                borderRadius: "6px",
                cursor: "pointer",
              }}
              title="Log out"
            >
              Sign out
            </button>
          </div>
          <span className="sidebar-label">CHATS</span>
          <div className="people-heading">
            <h1>People</h1>
            <span className="people-count">{users.length}</span>
          </div>
          <label className="search-box">
            <span aria-hidden="true">&#x2315;</span>
            <input
              aria-label="Search people"
              placeholder="Find someone..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>

        <div className="people-list" aria-label="People">
          {loadingUsers && <p className="list-state">Finding users...</p>}
          {!loadingUsers && filteredUsers.length === 0 && (
            <p className="list-state">{users.length ? "No one matches that search." : "No other users registered."}</p>
          )}
          {filteredUsers.map((person) => {
            const isOnline = onlineUserIds.has(person._id?.toString());
            return (
              <button
                className={`person-row${selectedUser?._id === person._id ? " selected" : ""}`}
                key={person._id}
                type="button"
                onClick={() => {
                  setSelectedUser(person);
                  setMobileChatOpen(true);
                }}
              >
                <div style={{ position: "relative" }}>
                  <Avatar person={person} />
                  <span
                    style={{
                      position: "absolute",
                      bottom: 0,
                      right: 0,
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      backgroundColor: isOnline ? "#22c55e" : "#94a3b8",
                      border: "2px solid #0f172a",
                    }}
                    title={isOnline ? "Online" : "Offline"}
                  />
                </div>
                <span className="person-copy">
                  <strong>{displayName(person)}</strong>
                  <span>{person.email}</span>
                </span>
                <span className="person-arrow" aria-hidden="true">
                  &rsaquo;
                </span>
              </button>
            );
          })}
        </div>

        <div className="profile-row">
          <Avatar person={state.user} small />
          <span className="profile-copy">
            <strong>{displayName(state.user)}</strong>
            <span>{state.user?.email || "My account"}</span>
          </span>
          <span className="profile-presence" title="Online" />
        </div>
      </aside>

      {/* Main Conversation Area */}
      <section className="conversation-panel" aria-label="Conversation">
        {selectedUser ? (
          <>
            <header className="conversation-header">
              <button
                className="back-button"
                type="button"
                aria-label="Back to people"
                onClick={() => setMobileChatOpen(false)}
              >
                &larr;
              </button>
              <Avatar person={selectedUser} />
              <div className="conversation-person">
                <h2>{displayName(selectedUser)}</h2>
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <i
                    style={{
                      display: "inline-block",
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: onlineUserIds.has(selectedUser._id?.toString()) ? "#22c55e" : "#94a3b8",
                    }}
                  />
                  {onlineUserIds.has(selectedUser._id?.toString()) ? "Online" : "Offline"}
                </span>
              </div>
            </header>

            <div className="message-area">
              <div className="conversation-start">
                <span className="start-rule" />
                <span>START OF DIRECT CONVERSATION</span>
                <span className="start-rule" />
              </div>

              {loadingMessages && <p className="list-state">Loading messages...</p>}

              {!loadingMessages &&
                messages.map((message) => {
                  const senderId = (message.from?._id || message.from)?.toString();
                  const mine = senderId === state.user?._id?.toString();
                  return (
                    <div className={`message-row${mine ? " mine" : ""}`} key={message._id}>
                      {!mine && <Avatar person={message.from} small />}
                      <div className="message-content">
                        <div className="message-meta">
                          <strong>{mine ? "You" : displayName(message.from)}</strong>
                          <time>{formatTime(message.createdOn)}</time>
                        </div>
                        <p className="message-bubble">{message.message}</p>
                      </div>
                    </div>
                  );
                })}

              {!loadingMessages && messages.length === 0 && (
                <p className="empty-conversation">No messages yet. Send a message to start the chat!</p>
              )}

              {isTyping && (
                <div style={{ color: "#94a3b8", fontSize: "0.85rem", fontStyle: "italic", padding: "4px 8px" }}>
                  {selectedUser.firstName} is typing...
                </div>
              )}

              <div ref={endOfMessages} />
            </div>

            {error && (
              <p className="chat-error" role="alert">
                {error}
              </p>
            )}

            <form className="composer" onSubmit={sendMessage}>
              <input
                aria-label="Write a message"
                placeholder={`Message ${selectedUser.firstName || "..."}`}
                value={draft}
                onChange={handleDraftChange}
              />
              <span className="composer-hint">Enter to send</span>
              <button
                className="send-button"
                type="submit"
                disabled={!draft.trim() || sending}
                aria-label="Send message"
                title="Send message"
              >
                {sending ? "..." : "↑"}
              </button>
            </form>
          </>
        ) : (
          <div className="welcome-panel">
            <div className="welcome-art" aria-hidden="true">
              <span className="art-ring ring-a" />
              <span className="art-ring ring-b" />
              <span className="art-spark">&#x2733;</span>
              <span className="art-dot" />
            </div>
            <span className="eyebrow">READY TO CONNECT</span>
            <h2>Select a user to chat</h2>
            <p>Choose anyone from the sidebar to start a real-time socket chat.</p>
          </div>
        )}
      </section>
    </main>
  );
}

export default ChatPage;
