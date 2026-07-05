import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import ModuleSidebar from "../../components/ModuleSidebar";
import ChatSidebarList from "../../components/ChatSidebarList";
import { getModule } from "../_config";
import { deleteChat, listChats } from "../../api/chats";

const MODULE_ID = "analytics";

export default function AnalyticsLayout() {
  const module = getModule(MODULE_ID);
  const base = `/m/${MODULE_ID}`;
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const activeChatId = params.chatId || null;

  const [chats, setChats] = useState([]);

  const refreshChats = useCallback(async () => {
    try {
      const list = await listChats(MODULE_ID);
      setChats(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    refreshChats();
  }, [refreshChats]);

  const onSelect = (id) => navigate(`${base}/chat/${id}`);

  const onDelete = async (id) => {
    await deleteChat(id);
    const list = await refreshChats();
    if (activeChatId === id) {
      navigate(list[0] ? `${base}/chat/${list[0].id}` : base);
    }
  };

  const isChatRoute =
    location.pathname === base ||
    location.pathname === `${base}/chat` ||
    location.pathname.startsWith(`${base}/chat/`);

  return (
    <>
      <ModuleSidebar module={module}>
        {isChatRoute && (
          <ChatSidebarList
            chats={chats}
            activeId={activeChatId}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        )}
      </ModuleSidebar>
      <main className="flex-1 min-w-0 overflow-hidden">
        <Outlet context={{ refreshChats }} />
      </main>
    </>
  );
}
