import { useState } from "react";

const UserInfoBox = ({ onUserFetched }: { 
  onUserFetched: (userId: string, roles: string, email: string) => void 
}) => {
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [roles, setRoles] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const handleFetch = async () => {
    setError(null);
    try {
      const resp = await fetch("http://localhost:8000/v1/user/fetch", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}` 
        },
        body: JSON.stringify({ email }), // <-- only pass email
      });
      const data = await resp.json();
      if (data.status === "success" && data.user_id) {
        setUserId(data.user_id);
        setRoles(data.user_roles || "");
        onUserFetched(data.user_id, data.user_roles, email); // Pass email here
        // Log the fetched values
        console.log("Fetched user info:", {
          user_id: data.user_id,
          user_roles: data.user_roles});
      } else {
        setError(data.message || "User not found");
      }
    } catch {
      setError("Error connecting to server");
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "2rem auto", padding: "2rem", background: "#f8fafc", borderRadius: 12 }}>
      <h2>Fetch User Info Test</h2>
      <input
        type="email"
        placeholder="Enter user email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        style={{ width: "100%", padding: "0.7rem", marginBottom: "1rem", borderRadius: 8, border: "1px solid #ccc" }}
      />
      <button
        onClick={handleFetch}
        style={{ padding: "0.7rem 1.5rem", borderRadius: 8, background: "#6366f1", color: "#fff", border: "none", fontWeight: 500 }}
      >
        Fetch
      </button>
      {error && <div style={{ color: "red", marginTop: "1rem" }}>{error}</div>}
      {userId && (
        <div style={{ marginTop: "1rem" }}>
          <div><strong>User ID:</strong> {userId}</div>
          <div><strong>Roles:</strong> {roles}</div>
        </div>
      )}
    </div>
  );
};

export default UserInfoBox;