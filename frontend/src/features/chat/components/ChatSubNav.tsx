import React from 'react';
import styles from './ChatSubNav.module.css';
import { MessageSquare, Image, Pin, Phone, Users, Settings } from 'lucide-react';
import { useChat, type ChatSection } from '../../../context/ChatContext';

const TABS: Array<{ id: ChatSection; label: string; icon: React.ReactNode }> = [
  { id: 'messages', label: 'Messages', icon: <MessageSquare size={16} strokeWidth={2} /> },
  { id: 'files', label: 'Files & Media', icon: <Image size={16} strokeWidth={2} /> },
  { id: 'pins', label: 'Pins', icon: <Pin size={16} strokeWidth={2} /> },
  { id: 'calls', label: 'Call History', icon: <Phone size={16} strokeWidth={2} /> },
];

type ChatSubNavProps = {
  showGroupDetailsTabs?: boolean;
  restrictToMessages?: boolean;
};

const ChatSubNav: React.FC<ChatSubNavProps> = ({
  showGroupDetailsTabs = false,
  restrictToMessages = false,
}) => {
  const { activeSection, setActiveSection } = useChat();
  const tabs: Array<{ id: ChatSection; label: string; icon: React.ReactNode }> = restrictToMessages
    ? [TABS[0]!]
    : showGroupDetailsTabs
    ? [
        ...TABS,
        { id: 'members', label: 'Members', icon: <Users size={16} strokeWidth={2} /> },
        { id: 'settings', label: 'Settings', icon: <Settings size={16} strokeWidth={2} /> },
      ]
    : TABS;

  return (
    <nav className={styles.nav} aria-label="Chat sections">
      {tabs.map((tab) => {
        const isActive = activeSection === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
            aria-selected={isActive}
            role="tab"
            onClick={() => setActiveSection(tab.id)}
          >
            <span className={styles.tabIcon}>{tab.icon}</span>
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default ChatSubNav;
