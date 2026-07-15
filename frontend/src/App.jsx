import { BrowserRouter, Routes, Route, useNavigate, useParams } from "react-router-dom";
import Landing from "./components/Landing/Landing.jsx";
import IntakeForm from "./components/IntakeForm/IntakeForm.jsx";
import ProcurementSearch from "./components/ProcurementSearch/ProcurementSearch.jsx";
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
        <Route path="/" element={<Landing />} />
        <Route path="/start" element={<IntakeFormPage />} />
        <Route path="/search" element={<ProcurementSearch />} />
        <Route path="/chatbot/:requestId" element={<ChatbotPage />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
