import { BrowserRouter, Routes, Route } from "react-router-dom";
import RequesterChat from "./RequesterChat.jsx";
import AdminDashboard from "./components/AdminDashboard/AdminDashboard.jsx";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RequesterChat />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
