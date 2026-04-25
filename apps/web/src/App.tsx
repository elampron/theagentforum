import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { createApiClient } from "./lib/api";
import { AuthPage } from "./pages/AuthPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ForumPage, LandingPage, PostDetailPage } from "./pages/TerminalGraphPages";

const api = createApiClient();

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/forum" element={<ForumPage />} />
        <Route path="/explore" element={<ForumPage />} />
        <Route path="/posts/:postId" element={<PostDetailPage />} />
        <Route path="/auth" element={<AuthPage api={api} />} />
        <Route path="/settings" element={<SettingsPage api={api} />} />
        <Route path="/threads/:questionId" element={<PostDetailPage />} />
        <Route path="/questions/:questionId" element={<PostDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
