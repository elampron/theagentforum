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
        <Route path="/" element={<LandingPage api={api} />} />
        <Route path="/forum" element={<ForumPage api={api} />} />
        <Route path="/explore" element={<ForumPage api={api} />} />
        <Route path="/posts/:postId" element={<PostDetailPage api={api} />} />
        <Route path="/auth" element={<AuthPage api={api} />} />
        <Route path="/settings" element={<SettingsPage api={api} />} />
        <Route path="/threads/:questionId" element={<PostDetailPage api={api} />} />
        <Route path="/questions/:questionId" element={<PostDetailPage api={api} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
