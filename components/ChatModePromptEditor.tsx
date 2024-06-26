import { SYSTEM_MESSAGE } from "@/lib/consts";
import {
  QAPair,
  SelectedHistoryContext,
  SelectedRecordContext,
} from "@/lib/context";
import { __debug, __error } from "@/lib/logger";
import { Button, Textarea } from "@nextui-org/react";
import moment from "moment";
import { FC, useContext, useEffect, useRef, useState } from "react";
import { HiMiniPaperAirplane } from "react-icons/hi2";
import Markdown from "react-markdown";


const CHAT_BOT_NAME =
  process.env.NEXT_PUBLIC_INTERNAL_MODEL_NAME || "Lamdam-AI";

interface Props {
  initialMessage?: string;
}

const ChatModePromptEditor: FC<Props> = ({ initialMessage }) => {
  let { currentRecord, setCurrentRecord } = useContext(SelectedRecordContext);

  // const { currentCollection, setCurrentCollection } =
  //   useContext(CollectionContext);

  const [dirty, setDirty] = useState(false);
  const [rawHistory, setRawHistory] = useState("");

  return <ChatBox initialMessage={initialMessage} />;
};

export default ChatModePromptEditor;

function getKiaiApiUrl(): string {
  return localStorage.getItem("lamdam.kiaiApiUrl") || "";
}

function formatDistanceToNow(distance: Date): string {
  return moment(distance).fromNow();
}

type Message = {
  id: number;
  creator: string;
  content: string;
  date: Date;
};

async function sendMessage(
  text: string,
  histories: Message[],
  onData: (message: string, isDone: boolean) => void,
  onError: (e: any) => void
) {
  let url = `${process.env.NEXT_PUBLIC_KIAI_API_URL}/v1/chat/completions`;

  if (getKiaiApiUrl()) {
    url = getKiaiApiUrl()! + "/v1/chat/completions";
  }

  const messages = [
    {
      role: "system",
      content: SYSTEM_MESSAGE,
    },
    {
      role: "user",
      content: `Namamu adalah ${CHAT_BOT_NAME}, sebuah kecerdasan buatan yang ditraining menggunakan kitab-kitab pesantren.`,
    },
    {
      role: "assistant",
      content: `Terimakasih, nama saya adalah ${CHAT_BOT_NAME}`,
    },
  ];

  histories.forEach((h) => {
    messages.push({
      role: h.creator === "me" ? "user" : "assistant",
      content: h.content,
    });
  });

  messages.pop(); // remove last message

  messages.push({
    role: "user",
    content: text,
  });

  let query = {
    model: "llama-2",
    messages,
    temperature: 0.3,
    top_p: 0.1,
    n: 1,
    max_tokens: 1024,
    frequency_penalty: 0.1,
    stream: true,
  };
  const requestOptions: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
  };
  try {
    const response = await fetch(url, requestOptions);

    const reader = response!
      .body!.pipeThrough(new TextDecoderStream())
      .getReader();

    let dataBuff = "";
    let receivedDataBuff = "";
    let _inData = false;
    readerLoop: while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      console.log("Received", value);

      const values = value.split("\n");
      forLinesLoop: for (let i = 0; i < values.length; i++) {
        const v = values[i].trim();
        if (v === "") continue forLinesLoop;
        if (v === "data: [DONE]") {
          onData(dataBuff, true);
          break readerLoop;
        }
        let d: any = {};
        try {
          if (v.indexOf("data: ") > -1) {
            _inData = true;
            receivedDataBuff = v.replace("data: ", "");
            d = JSON.parse(receivedDataBuff);
          } else {
            if (_inData) {
              receivedDataBuff += v;
              d = JSON.parse(receivedDataBuff);
              _inData = false;
              receivedDataBuff = "";
            } else {
              d = JSON.parse(v);
            }
          }
        } catch (e) {
          if (_inData) {
            continue forLinesLoop;
          }
          __error("cannot parse response", e);
          __error("response v:", v);
          __error("receivedDataBuff:", receivedDataBuff);
          onError(true);
        }
        if (d.choices && d.choices.length > 0) {
          if (d.choices[0].delta.content) {
            dataBuff += d.choices[0].delta.content;
            if (dataBuff) {
              onData(dataBuff, false);
            }
          }
        }
      }
    }
  } catch (e) {
    __error("error:", e);
    onError(e);
  }
}

let GLOBAL_IN_PROCESSING_MESSAGE = false;
let _AUTO_SCROLLER_IVAL: NodeJS.Timer | null = null;

const formatMessageOutput = (message: string) => {
  return (
    message
      .replaceAll("\n", "<br/>")
      // replace ```pre``` with <pre>code</pre>
      .replaceAll(
        /```(python|rust|html|scss)?([^```]+)```/g,
        `<pre class="bg-gray-900 p-2 text-green-400 rounded-md text-sm mt-4">$2</pre>`
      )
      .replaceAll(
        /```(python|rust|html|scss)?/g,
        `<pre class="bg-gray-900 p-2 text-green-400 rounded-md text-sm mt-4">`
      )
  );
};

const mdComponents = {
  code: ({ ...props }) => (
    <code
      {...props}
      className="text-green-400 text-sm font-mono whitespace-pre-wrap"
    />
  ),
  pre: ({ ...props }) => (
    <pre
      {...props}
      className="bg-slate-800 py-2 px-3 text-green-400 rounded-lg text-sm mt-4 font-mono whitespace-pre-wrap"
    />
  ),
}

interface ChatBoxProps {
  initialMessage?: string;
}

const ChatBox: FC<ChatBoxProps> = ({ initialMessage }) => {
  let { newHistory, setNewHistory } = useContext(SelectedHistoryContext);

  const [messagesHistory, setMessagesHistory] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [buffMessage, setBuffMessage] = useState("");
  const [inProcessingMessage, setInProcessingMessage] = useState(false);

  useEffect(() => {
    if (_AUTO_SCROLLER_IVAL !== null) {
      clearInterval(_AUTO_SCROLLER_IVAL);
      _AUTO_SCROLLER_IVAL = null;
    }
    _AUTO_SCROLLER_IVAL = setTimeout(() => {
      __debug("in auto scroller ival");
      const el = document.getElementById("ChatBox");
      if (el) {
        el.scrollTop = el.scrollHeight;
      }

      // finally, set message history context
      updateHistoryContext();
    }, 1000);
    const el = document.getElementById("ChatBox");
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [buffMessage]);

  useEffect(() => {
    if (initialMessage && messagesHistory.length === 0) {
      setInputMessage(initialMessage);
    }
    if (newHistory.length > 0) {
      // setMessagesHistory([]);
      let _messagesHistory: Message[] = [];
      let counter = 1;
      newHistory.forEach((qaPair) => {
        _messagesHistory.push({
          id: Date.now() + ++counter,
          creator: "me",
          content: qaPair.a,
          date: new Date(),
        });
        _messagesHistory.push({
          id: Date.now() + ++counter,
          creator: CHAT_BOT_NAME,
          content: qaPair.b,
          date: new Date(),
        });
      });
      setMessagesHistory(_messagesHistory);
    }
  }, [initialMessage, newHistory]);

  const updateHistoryContext = () => {
    __debug("in updateHistoryContext()");
    const result: QAPair[] = messagesHistory
      .reduce((acc: Message[][], curr, idx, src) => {
        if (idx % 2 === 0) acc.push([curr, src[idx + 1]]);
        return acc;
      }, [])
      .map((msgs) => {
        __debug("msgs:", msgs);
        return {
          a: msgs[0]?.content || "",
          b: msgs[1]?.content || "",
        };
      });
    __debug("result:", result);

    setNewHistory(result);
  };

  const handleSendMessage = () => {
    __debug("in handleSendMessage()");
    if (inputMessage.trim().length == 0) {
      return;
    }
    if (GLOBAL_IN_PROCESSING_MESSAGE) {
      return;
    }
    if (inProcessingMessage) {
      return;
    }
    setInProcessingMessage(true);
    GLOBAL_IN_PROCESSING_MESSAGE = true;

    messagesHistory.push({
      id: Date.now(),
      creator: "me",
      content: inputMessage,
      date: new Date(),
    });
    setMessagesHistory(messagesHistory);

    void sendMessage(
      inputMessage.trim(),
      messagesHistory,
      (message, isDone) => {
        // __debug('message:', message)
        if (!isDone) {
          setBuffMessage(message);
          setInProcessingMessage(false);
          GLOBAL_IN_PROCESSING_MESSAGE = false;
        } else if (isDone) {
          messagesHistory.push({
            id: Date.now(),
            creator: CHAT_BOT_NAME,
            content: message,
            date: new Date(),
          });
          setMessagesHistory(messagesHistory);
          setInputMessage("");
          setBuffMessage("");
          inputRef?.current?.focus();
        }
      },
      (e) => {
        __error("error:", e);
        setInProcessingMessage(false);
        GLOBAL_IN_PROCESSING_MESSAGE = false;
      }
    );

    // set focus to textarea
    inputRef?.current?.focus();
  };

  return (
    <div className="w-full h-full max-h-full relative">
      <div
        id="ChatBox"
        className="overflow-y-auto custom-scrollbar rounded-lg p-4 max-h-[calc(100vh-330px)] min-h-[calc(100vh-330px)] flex flex-col gap-4"
      >
        {messagesHistory
          .filter((m) => m.content.trim().length > 0)
          .map((message) => (
            <div
              key={message.id}
              className={`flex flex-col px-6 py-4 gap-2 rounded-xl ${message.creator !== "me" ? "border-l-4 border-l-primary dark:bg-primary/10 bg-primary/5" : "border-2 border-divider"
                }`}
            >
              <span
                className={`${message.creator !== "me"
                  ? ""
                  : "text-gray-600 dark:text-gray-300"
                  } font-semibold`}
              >
                {message.creator === CHAT_BOT_NAME
                  ? CHAT_BOT_NAME
                  : message.creator}
                :
              </span>
              <Markdown
                className="markdown"
                components={mdComponents}
              >
                {message.content}
              </Markdown>
              <span className="dark:text-gray-400 text-gray-700 text-sm">
                {formatDistanceToNow(message.date)}
              </span>
            </div>
          ))}

        {buffMessage && (
          <div key={0} className="flex flex-col px-6 py-4 gap-2 rounded-xl border-l-4 border-l-primary dark:bg-primary/10 bg-primary/5">
            <p className="dark:text-gray-600 font-semibold">
              {CHAT_BOT_NAME}:
            </p>
            <Markdown
              className="markdown"
              components={mdComponents}
            >
              {buffMessage}
            </Markdown>
          </div>
        )}
      </div>
      <div className="sticky left-0 p-4 bottom-0 w-full flex gap-2 justify-between items-start">
        <Textarea
          size="lg"
          placeholder="Enter your prompt"
          fullWidth
          radius="md"
          multiple
          classNames={{
            inputWrapper:
              "border dark:border-none pr-0 dark:group-data-[focus=true]:bg-[#374151] dark:bg-[#374151] bg-[#F9FAFB] shadow-none",
            input: "bg-transparent",
          }}
          value={inputMessage}
          onValueChange={setInputMessage}
          ref={inputRef as any}
          autoFocus
          disabled={inProcessingMessage}
          onKeyDown={(e) => {
            // handle Command+enter or Ctrl+enter
            if (
              (e.ctrlKey || e.metaKey || e.key === "Meta") &&
              e.key === "Enter"
            ) {
              handleSendMessage();
            }
          }}
        />
        <Button
          isIconOnly
          isLoading={inProcessingMessage}
          variant="solid"
          color="success"
          onPress={handleSendMessage}
          onKeyDown={(e) => {
            // handle enter or space
            if (e.key === "Enter" || e.key === " ") {
              handleSendMessage();
            }
          }}
          size="lg"
          isDisabled={inProcessingMessage}
          className="mt-1.5"
        >
          <HiMiniPaperAirplane className="w-6 h-6" />
        </Button>
      </div>
    </div>
  );
};
