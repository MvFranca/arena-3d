import { HomeScreen } from "./screens/HomeScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { MatchScreen } from "./screens/MatchScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { QueueScreen } from "./screens/QueueScreen";
import { ResultScreen } from "./screens/ResultScreen";
import { useAppState } from "./store";

export function App() {
  const screen = useAppState((s) => s.screen);
  switch (screen) {
    case "match":
      return <MatchScreen />;
    case "lobby":
      return <LobbyScreen />;
    case "result":
      return <ResultScreen />;
    case "profile":
      return <ProfileScreen />;
    case "queue":
      return <QueueScreen />;
    default:
      return <HomeScreen />;
  }
}
