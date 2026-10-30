import { StrictMode, Suspense, lazy, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { setAuthHandler } from "./api";
import { Spinner } from "./components/ui";
import Landing from "./pages/Landing";
import "./styles.css";

// Student pages load eagerly (most traffic); staff pages are split into their own chunks.
const Register = lazy(() => import("./pages/Register"));
const Confirmation = lazy(() => import("./pages/Confirmation"));
const MyPass = lazy(() => import("./pages/MyPass"));
const Pass = lazy(() => import("./pages/Pass"));
const Login = lazy(() => import("./pages/staff/Login"));
const ChangePassword = lazy(() => import("./pages/staff/ChangePassword"));
const Dashboard = lazy(() => import("./pages/staff/Dashboard"));
const Scanner = lazy(() => import("./pages/staff/Scanner"));
const Manage = lazy(() => import("./pages/staff/Manage"));
const EventSettings = lazy(() => import("./pages/staff/EventSettings"));
const Attendance = lazy(() => import("./pages/staff/Attendance"));
const Absent = lazy(() => import("./pages/staff/Absent"));
const FacultyReport = lazy(() => import("./pages/staff/FacultyReport"));
const EventSummary = lazy(() => import("./pages/staff/EventSummary"));
const AuditLog = lazy(() => import("./pages/staff/AuditLog"));

function AuthRedirects() {
  const nav = useNavigate();
  useEffect(() => {
    setAuthHandler((kind) => nav(kind === "login" ? "/staff/login" : "/staff/change-password", { replace: true }));
    return () => setAuthHandler(null);
  }, [nav]);
  return null;
}

function App() {
  return (
    <BrowserRouter>
      <AuthRedirects />
      <Suspense fallback={<div style={{ paddingTop: 80 }}><Spinner /></div>}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/register" element={<Register />} />
          <Route path="/confirmation" element={<Confirmation />} />
          <Route path="/my-pass" element={<MyPass />} />
          <Route path="/pass" element={<Pass />} />
          <Route path="/staff" element={<Navigate to="/staff/login" replace />} />
          <Route path="/staff/login" element={<Login />} />
          <Route path="/staff/change-password" element={<ChangePassword />} />
          <Route path="/staff/dashboard" element={<Dashboard />} />
          <Route path="/staff/scanner" element={<Scanner />} />
          <Route path="/staff/manage" element={<Manage />} />
          <Route path="/staff/event-settings" element={<EventSettings />} />
          <Route path="/staff/attendance" element={<Attendance />} />
          <Route path="/staff/absent" element={<Absent />} />
          <Route path="/staff/faculty-report" element={<FacultyReport />} />
          <Route path="/staff/event-summary" element={<EventSummary />} />
          <Route path="/staff/audit" element={<AuditLog />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
