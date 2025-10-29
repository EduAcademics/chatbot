import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { FiSun, FiMoon, FiLogOut } from "react-icons/fi";
import Login from "./pages/Login";
import AudioStreamerChatBot from "./components/AudioStreamerChatBot";
import UserInfoBox from "./components/UserInfoBox";
// import AttendanceTest from "./pages/AttendanceTest";

function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem("token"));
  const [userId, setUserId] = useState<string | null>(null);
  const [roles, setRoles] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>(""); // Add this line

  useEffect(() => {
    setIsAuthenticated(!!localStorage.getItem("token"));
  }, []);

  // Log current state values
  console.log("App State in app.tsx:", { userId, roles, isAuthenticated, darkMode });


  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location.href = "/login";
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/" />} />
        {/* <Route path="/test-attendance" element={<AttendanceTest />} /> */}
        <Route
          path="/"
          element={
            isAuthenticated ? (
              <>
                <h2
                  style={{
                    position: "absolute",
                    top: "1rem",
                    left: "50%",
                    transform: "translateX(-50%)",
                    margin: 0,
                    fontSize: "clamp(1rem, 2vw, 1.4rem)",
                    color: darkMode ? "#f0f0f0" : "#222",
                    opacity: 0.9,
                    fontWeight: 500,
                    zIndex: 10,
                  }}
                >
                  🧠 GenAI Chat Assistant
                </h2>
                <div
                  style={{
                    position: "absolute",
                    top: "1rem",
                    right: "1rem",
                    zIndex: 10,
                    display: "flex",
                    gap: "0.5rem",
                  }}
                >
                  <button
                    onClick={() => setDarkMode(!darkMode)}
                    style={{
                      width: "40px",
                      height: "40px",
                      backgroundColor: darkMode ? "#333" : "#ddd",
                      color: darkMode ? "#f0f2f5" : "#000",
                      border: "none",
                      borderRadius: "50%",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.2rem",
                    }}
                    title={darkMode ? "Light Mode" : "Dark Mode"}
                  >
                    {darkMode ? <FiSun /> : <FiMoon />}
                  </button>
                  <button
                    onClick={handleLogout}
                    style={{
                      width: "40px",
                      height: "40px",
                      backgroundColor: darkMode ? "#333" : "#ddd",
                      color: darkMode ? "#f0f2f5" : "#000",
                      border: "none",
                      borderRadius: "50%",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.2rem",
                    }}
                    title="Logout"
                  >
                    <FiLogOut />
                  </button>
                </div>
                {!userId ? (
                  <UserInfoBox onUserFetched={(id, r, email) => { 
                    setUserId(id); 
                    setRoles(r); 
                    setUserEmail(email); 
                  }} />
                ) : (
                  <AudioStreamerChatBot 
                    darkMode={darkMode} 
                    userId={userId} 
                    roles={roles} 
                    email={userEmail} 
                  />
                )}
              </>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
