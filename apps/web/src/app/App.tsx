import { useEffect } from "react";
import { createBrowserRouter, RouterProvider, redirect } from "react-router-dom";
import { SignupScreen } from "../auth/SignupScreen";
import { SignInScreen } from "../auth/SignInScreen";
import { HokmGame } from "../games/hokm/HokmGame";
import { LandingPage } from "../landing/LandingPage";
import { LobbyScreen } from "../lobby/LobbyScreen";
import { ProfileScreen } from "../profile/ProfileScreen";
import { getStoredToken } from "../auth/auth-store";
import { socket } from "./socket";
import { PwaUpdatePrompt } from "./PwaUpdatePrompt";

const router = createBrowserRouter([
  {
    path: "/",
    element: <LandingPage />,
  },
  {
    path: "/signup",
    loader: () => (getStoredToken() ? redirect("/lobby") : null),
    element: <SignupScreen />,
  },
  {
    path: "/signin",
    loader: () => (getStoredToken() ? redirect("/lobby") : null),
    element: <SignInScreen />,
  },
  {
    path: "/lobby",
    loader: () => (!getStoredToken() ? redirect("/signup") : null),
    element: <LobbyScreen />,
  },
  {
    path: "/profile",
    loader: () => (!getStoredToken() ? redirect("/signup") : null),
    element: <ProfileScreen />,
  },
  {
    path: "/room/:code",
    loader: () => (!getStoredToken() ? redirect("/signup") : null),
    element: <HokmGame />,
  },
]);

export function App() {
  useEffect(() => {
    // Connecting triggers the "connect" handler in socket.ts, which
    // authenticates with the stored token and re-joins any active room.
    // This same path runs on every automatic reconnect after a drop.
    socket.connect();
    return () => void socket.disconnect();
  }, []);

  return (
    <>
      <RouterProvider router={router} />
      <PwaUpdatePrompt />
    </>
  );
}
