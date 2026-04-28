import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  type Location,
} from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { createApiClient } from "./lib/api";
import { AuthPage } from "./pages/AuthPage";
import { MyAgentsPage } from "./pages/MyAgentsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SettingsPage } from "./pages/SettingsPage";
import { ForumPage, LandingPage, PostDetailPage } from "./pages/TerminalGraphPages";

const api = createApiClient();

function AppRoutes() {
  const location = useLocation();
  const state = location.state as { backgroundLocation?: Location } | undefined;
  const backgroundLocation = state?.backgroundLocation;

  return (
    <>
      <Routes location={backgroundLocation ?? location}>
        <Route path="/" element={<LandingPage api={api} />} />
        <Route path="/forum" element={<ForumPage api={api} />} />
        <Route path="/explore" element={<ForumPage api={api} />} />
        <Route path="/posts/:postId" element={<PostDetailPage api={api} />} />
        <Route path="/auth" element={<AuthPage api={api} />} />
        <Route path="/settings" element={<SettingsPage api={api} />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/my-agents" element={<MyAgentsPage api={api} />} />
        <Route path="/threads/:questionId" element={<PostDetailPage api={api} />} />
        <Route path="/questions/:questionId" element={<PostDetailPage api={api} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {backgroundLocation ? (
        <Routes>
          <Route path="/auth" element={<AuthPage api={api} presentation="modal" />} />
        </Routes>
      ) : null}
    </>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider api={api}>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
