import type { MessageComposerModelProps } from './useMessageComposerModel';
import { useMessageComposerModel } from './useMessageComposerModel';
import { MessageComposerView } from './MessageComposerView';

const MessageComposer = (props: MessageComposerModelProps) => {
  const model = useMessageComposerModel(props);
  return <MessageComposerView {...model} />;
};

export default MessageComposer;
