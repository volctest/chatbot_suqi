import { useConversation } from '../context/ConversationContext';
import { cn } from '../lib/utils';

export function MessageList() {
  const { messages } = useConversation();

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={cn(
            "flex w-full",
            message.sender === 'user' ? "justify-end" : "justify-start"
          )}
        >
          <div
            className={cn(
              "max-w-[80%] rounded-lg px-4 py-2",
              message.sender === 'user'
                ? "bg-blue-500 text-white"
                : message.error
                  ? "bg-red-100 text-red-900"
                  : "bg-gray-100 text-gray-900"
            )}
          >
            <p className="text-sm">{message.text}</p>
            {message.videoContext && (
              <p className="text-xs mt-1 italic">
                Video context available
              </p>
            )}
            <span className="text-xs opacity-70 mt-1 block">
              {new Date(message.timestamp).toLocaleTimeString()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
