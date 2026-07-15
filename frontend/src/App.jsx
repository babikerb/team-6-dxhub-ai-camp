import { useEffect, useState } from "react";
import IntakeForm from "./components/IntakeForm/IntakeForm.jsx";
import RequesterChat from "./RequesterChat.jsx";

function parseRoute(pathname) {
  const chatMatch = pathname.match(/^\/chatbot\/([^/]+)\/?$/);
  if (chatMatch) return { name: "chatbot", requestId: decodeURIComponent(chatMatch[1]) };
  return { name: "intake" };
}

function App() {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));

  useEffect(() => {
    function onPopState() {
      setRoute(parseRoute(window.location.pathname));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigateToChatbot(requestId) {
    window.history.pushState({}, "", `/chatbot/${encodeURIComponent(requestId)}`);
    setRoute({ name: "chatbot", requestId });
  }

  if (route.name === "chatbot") {
    return <RequesterChat requestId={route.requestId} />;
  }
  return <IntakeForm onSubmitted={navigateToChatbot} />;
}

export default App;
