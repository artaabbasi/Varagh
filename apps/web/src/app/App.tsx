import { useEffect } from "react";
import { createBrowserRouter, RouterProvider, redirect } from "react-router-dom";
import { SignupScreen } from "../auth/SignupScreen";
import { getStoredToken, clearToken } from "../auth/auth-store";
import { socket } from "./socket";

const router = createBrowserRouter([
  {
    path: "/",
    loader: () => redirect(getStoredToken() ? "/lobby" : "/signup"),
  },
  {
    path: "/signup",
    loader: () => (getStoredToken() ? redirect("/lobby") : null),
    element: <SignupScreen />,
  },
  {
    path: "/lobby",
    loader: () => (!getStoredToken() ? redirect("/signup") : null),
    element: (
      <div style={{ padding: "2rem", color: "var(--md-sys-color-on-background)" }}>
        Lobby — coming soon
      </div>
    ),
  },
]);

export function App() {
  useEffect(() => {
    socket.connect();
    const token = getStoredToken();
    if (token) {
      socket.emit("auth:login", { token }, (res) => {
        if (!res.ok) clearToken();
      });
    }
    return () => void socket.disconnect();
  }, []);

  return <RouterProvider router={router} />;
}
