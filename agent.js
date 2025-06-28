import Groq from "groq-sdk";
import readline from "node:readline/promises";

// Database storage - In-memory arrays to store financial data
// In a production environment, these would be replaced with a proper database
const expenseDB = []; // Stores expense entries with name, amount, and date
const incomeDB = []; // Stores income entries with name, amount, and date

// Initialize Groq client with API key from environment variables
// The API key should be set in your environment variables for security
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Tool definitions - These define the functions that the AI can call
// Each tool has a name, description, and parameter schema
const TOOLS = [
  {
    type: "function",
    function: {
      name: "getTotalExpense",
      description: "Get total expense from date to date",
      parameters: {
        type: "object",
        properties: {
          from: {
            type: "string",
            description: "From date to get the expense",
          },
          to: {
            type: "string",
            description: "To date to get the expense",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "addExpense",
      description: "Add new expense entry to the expense database.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name of the expense. e.g., Bought an iphone",
          },
          amount: {
            type: "number", // Changed from string to number for better type safety
            description: "Amount of the expense.",
          },
        },
        required: ["name", "amount"], // These fields are mandatory
      },
    },
  },
  {
    type: "function",
    function: {
      name: "addIncome",
      description: "Add new income entry to income database",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name of the income. e.g., Got salary",
          },
          amount: {
            type: "number", // number for better type safety
            description: "Amount of the income.",
          },
        },
        required: ["name", "amount"], // These fields are mandatory
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getMoneyBalance",
      description: "Get remaining money balance from database.",
      // No parameters needed for this function
    },
  },
];

// Tool execution functions - These are the actual implementations of the tools
// Each function corresponds to a tool definition above
const toolFunctions = {
  // Calculate total expenses (currently returns all expenses, date filtering not implemented)
  getTotalExpense: ({ from, to }) => {
    const totalExpense = expenseDB.reduce((acc, item) => acc + item.amount, 0);
    return `${totalExpense} INR`;
  },

  // Add a new expense entry with validation
  addExpense: ({ name, amount }) => {
    // Validate input data
    if (!name || amount === undefined || amount < 0) {
      return "Error: Invalid expense data. Name and positive amount are required.";
    }
    // Add expense with timestamp for future date filtering
    expenseDB.push({ name, amount, date: new Date().toISOString() });
    return `Added expense: ${name} - ${amount} INR to the database.`;
  },

  // Add a new income entry with validation
  addIncome: ({ name, amount }) => {
    // Validate input data
    if (!name || amount === undefined || amount < 0) {
      return "Error: Invalid income data. Name and positive amount are required.";
    }
    // Add income with timestamp for future date filtering
    incomeDB.push({ name, amount, date: new Date().toISOString() });
    return `Added income: ${name} - ${amount} INR to the database.`;
  },

  // Calculate current balance (income - expenses)
  getMoneyBalance: () => {
    const totalIncome = incomeDB.reduce((acc, item) => acc + item.amount, 0);
    const totalExpense = expenseDB.reduce((acc, item) => acc + item.amount, 0);
    const balance = totalIncome - totalExpense;
    return `${balance} INR`;
  },
};

/**
 * Process tool calls from the AI model
 * This function executes the tools that the AI wants to use and adds the results to the conversation
 * @param {Array} toolCalls - Array of tool calls from the AI model
 * @param {Array} messages - The conversation messages array to append results to
 */
async function processToolCalls(toolCalls, messages) {
  for (const tool of toolCalls) {
    const functionName = tool.function.name;
    const functionArgs = tool.function.arguments;

    try {
      // Parse the arguments from JSON string to object
      const args = JSON.parse(functionArgs);
      // Execute the corresponding tool function
      const result = toolFunctions[functionName](args);

      // Add the tool result to the conversation
      messages.push({
        role: "tool",
        content: result,
        tool_call_id: tool.id, // Link the result to the specific tool call
      });
    } catch (error) {
      // Handle errors in tool execution
      console.error(`Error processing tool call ${functionName}:`, error);
      messages.push({
        role: "tool",
        content: `Error: Failed to execute ${functionName}`,
        tool_call_id: tool.id,
      });
    }
  }
}

/**
 * Generate the system message for the AI
 * This defines the AI's role, capabilities, and current context
 * @returns {Object} System message object
 */
function getSystemMessage() {
  return {
    role: "system",
    content: `You are FinAI, a professional personal finance assistant designed to help users manage their finances effectively. Your primary goal is to provide accurate, helpful, and actionable financial guidance.

## YOUR ROLE & PERSONALITY:
- Be friendly, professional, and empathetic
- Always provide clear explanations for your actions
- Ask clarifying questions when information is unclear
- Proactively suggest helpful financial insights
- Maintain a conversational but informative tone

## YOUR CAPABILITIES:
You have access to the following financial management tools:

1. **getTotalExpense({from, to})**: Retrieve total expenses for a specific time period
   - Parameters: from (start date), to (end date) as strings
   - Returns: Total expense amount in INR
   - Use when users ask about spending in specific periods

2. **addExpense({name, amount})**: Record a new expense transaction
   - Parameters: name (description), amount (positive number)
   - Returns: Confirmation message
   - Always validate that amount is positive before adding

3. **addIncome({name, amount})**: Record a new income transaction
   - Parameters: name (description), amount (positive number)
   - Returns: Confirmation message
   - Always validate that amount is positive before adding

4. **getMoneyBalance()**: Calculate current financial balance
   - Parameters: None required
   - Returns: Current balance (income - expenses) in INR
   - Use to provide financial overview

## OPERATIONAL GUIDELINES:

### When Adding Transactions:
- Always ask for both name and amount if not provided
- Ensure amounts are positive numbers
- Provide clear confirmation messages
- Suggest categorizing expenses when appropriate

### When Providing Financial Insights:
- Calculate and show current balance when relevant
- Compare income vs expenses
- Identify spending patterns when possible
- Offer budgeting suggestions based on data

### Error Handling:
- If tool execution fails, explain the issue clearly
- Suggest alternative approaches when possible
- Always maintain helpful attitude even during errors

### Conversation Flow:
- Acknowledge user requests before taking action
- Explain what you're doing before using tools
- Provide summaries after completing actions
- Ask follow-up questions to ensure user satisfaction

## CURRENT CONTEXT:
- Current datetime: ${new Date().toUTCString()}
- Currency: Indian Rupees (INR)
- Data persistence: In-memory storage (data resets on restart)

## RESPONSE FORMAT:
1. Acknowledge the user's request
2. Explain your planned action
3. Execute necessary tools
4. Provide clear results and insights
5. Offer additional helpful suggestions when appropriate

Remember: Your goal is to make financial management simple, clear, and actionable for users. Always prioritize accuracy and user understanding.`,
  };
}

/**
 * Main agent conversation loop
 * This function handles the entire conversation flow between user and AI
 * It manages user input, AI responses, and tool execution
 */
async function callAgent() {
  // Create readline interface for user input/output
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Initialize conversation with system message
  const messages = [getSystemMessage()];

  // Display welcome message
  console.log(
    "Welcome! I'm Josh, your personal finance assistant. Type 'bye' to exit.\n"
  );

  try {
    // Main conversation loop - continues until user types 'bye'
    while (true) {
      // Get user input
      const question = await rl.question("User: ");

      // Check for exit command (case-insensitive)
      if (question.toLowerCase() === "bye") {
        console.log("Goodbye! Have a great day!");
        break;
      }

      // Skip empty inputs
      if (!question.trim()) {
        continue;
      }

      // Add user message to conversation history
      messages.push({
        role: "user",
        content: question,
      });

      // Agent response loop - handles AI responses and tool calls
      while (true) {
        try {
          // Call the Groq API to get AI response
          const completion = await groq.chat.completions.create({
            messages: messages, // Send entire conversation history
            model: "llama-3.3-70b-versatile", // Use Llama 3.3 70B model
            tools: TOOLS, // Provide available tools to the AI
            temperature: 0.7, // Control randomness (0.7 = balanced creativity)
          });

          // Extract the AI's response
          const message = completion.choices[0].message;
          messages.push(message);

          // Check if the AI wants to use any tools
          const toolCalls = message.tool_calls;

          if (!toolCalls) {
            // No tools needed - display AI response and continue
            console.log(`Assistant: ${message.content}`);
            break;
          }

          // Process tool calls and continue the conversation
          await processToolCalls(toolCalls, messages);
        } catch (error) {
          // Handle API errors gracefully
          console.error("Error in agent response:", error);
          console.log(
            "Assistant: I'm sorry, I encountered an error. Please try again."
          );
          break;
        }
      }
    }
  } catch (error) {
    // Handle any unexpected errors in the main loop
    console.error("Error in main loop:", error);
  } finally {
    // Always close the readline interface to clean up resources
    rl.close();
  }
}

// Application startup and validation
// Check if required environment variable is set
if (!process.env.GROQ_API_KEY) {
  console.error("Error: GROQ_API_KEY environment variable is required.");
  console.error("Please set your Groq API key in the environment variables.");
  process.exit(1); // Exit with error code
}

// Start the application and handle any unhandled errors
callAgent().catch(console.error);
