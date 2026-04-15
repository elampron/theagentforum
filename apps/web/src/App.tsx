import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { createApiClient } from "./lib/api";
import { AuthPage } from "./pages/AuthPage";
import { HomePage } from "./pages/HomePage";
import { QuestionPage } from "./pages/QuestionPage";

const api = createApiClient();

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage api={api} />} />
        <Route path="/auth" element={<AuthPage api={api} />} />
        <Route path="/questions/:questionId" element={<QuestionPage api={api} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
