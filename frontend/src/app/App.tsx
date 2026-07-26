// src/app/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import LoginPage from "../components/LoginPage";
import DashboardPage from "../components/DashboardPage";
import UploadCard from "../components/UploadCard";
import ProcessingPage from "../components/ProcessingPage";
import ResultsPage from "../components/ResultsPage";
import ClassicalSetupPage from "../components/ClassicalSetupPage";
import HorsesListPage from "../components/HorsesListPage";
import HorseHistoryPage from "../components/HorseHistoryPage";
import SessionListPage from "../components/SessionListPage";
import ProtectedRoute from "../components/ProtectedRoute";
import ClassicalMarkersSetup from "../components/ClassicalMarkersSetup";

function Logout() {
  localStorage.clear();
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/upload"
          element={
            <ProtectedRoute>
              <UploadCard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/processing/:sessionId"
          element={
            <ProtectedRoute>
              <ProcessingPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/results/:sessionId"
          element={
            <ProtectedRoute>
              <ResultsPage />
            </ProtectedRoute>
          }
        />


        <Route
          path="/horses"
          element={
            <ProtectedRoute>
              <HorsesListPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/horse-history/:horseId"
          element={
            <ProtectedRoute>
              <HorseHistoryPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/sessions"
          element={
            <ProtectedRoute>
              <SessionListPage />
            </ProtectedRoute>
          }
        />
        <Route
        path="/sessions/:sessionId/classical-setup"
        element={
          <ProtectedRoute>
            <ClassicalSetupPage />
          </ProtectedRoute>
        }
      />
      <Route
  path="/sessions/:sessionId/classical-markers-setup"
  element={<ClassicalMarkersSetup />}
/>

        <Route path="/logout" element={<Logout />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}