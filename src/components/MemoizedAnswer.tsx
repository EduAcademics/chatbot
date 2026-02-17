import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MemoizedAnswerProps {
  answer: string;
  messageIdx: number;
}

/**
 * Memoized markdown answer to prevent unnecessary re-renders.
 */
const MemoizedAnswer = memo(
  ({ answer, messageIdx }: MemoizedAnswerProps) => {
    return (
      <div
        key={`answer-${messageIdx}-${answer.slice(0, 20)}`}
        className="markdown-content"
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            table: ({ node, ...props }) => (
              <div className="markdown-table-container">
                <table {...props} />
              </div>
            ),
          }}
        >
          {answer || ""}
        </ReactMarkdown>
      </div>
    );
  },
  (prevProps, nextProps) =>
    prevProps.answer === nextProps.answer &&
    prevProps.messageIdx === nextProps.messageIdx
);

MemoizedAnswer.displayName = "MemoizedAnswer";

export default MemoizedAnswer;
