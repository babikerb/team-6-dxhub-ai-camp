import { BrowserRouter, Routes, Route, useNavigate, useParams } from "react-router-dom";
import IntakeForm from "./components/IntakeForm/IntakeForm.jsx";
import RequesterChat from "./RequesterChat.jsx";
import AdminDashboard from "./components/AdminDashboard/AdminDashboard.jsx";

function IntakeFormPage() {
  const navigate = useNavigate();
  return <IntakeForm onSubmitted={(requestId) => navigate(`/chatbot/${encodeURIComponent(requestId)}`)} />;
}

function ChatbotPage() {
  const { requestId } = useParams();
  return <RequesterChat requestId={decodeURIComponent(requestId)} />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<IntakeFormPage />} />
        <Route path="/chatbot/:requestId" element={<ChatbotPage />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
