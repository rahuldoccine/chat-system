import React from 'react';
import styles from './ChatSubNav.module.css';
import { MessageSquare, Image, Pin, Phone } from 'lucide-react';
import { useChat, type ChatSection } from '../../../context/ChatContext';

const TABS: Array<{ id: ChatSection; label: string; icon: React.ReactNode }> = [
  { id: 'messages', label: 'Messages', icon: <MessageSquare size={16} strokeWidth={2} /> },
  { id: 'files', label: 'Files & Media', icon: <Image size={16} strokeWidth={2} /> },
  { id: 'pins', label: 'Pins', icon: <Pin size={16} strokeWidth={2} /> },
  { id: 'calls', label: 'Call History', icon: <Phone size={16} strokeWidth={2} /> },
];

const ChatSubNav: React.FC = () => {
  const { activeSection, setActiveSection } = useChat();

  return (
    <nav className={styles.nav} aria-label="Chat sections">
      {TABS.map((tab) => {
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
