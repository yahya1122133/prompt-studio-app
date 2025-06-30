import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

beforeAll(() => {
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true
  });
});

beforeEach(() => {
  window.localStorage.clear();
  
  // Mock fetch globally
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        prompts: [
          "Generated prompt 1",
          "Generated prompt 2",
          "Generated prompt 3"
        ]
      }),
    })
  );
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('Prompt Studio App', () => {
  test('renders main UI components', () => {
    render(<App />);
    
    expect(screen.getByText(/Prompt Studio/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e.g., Generate a tweet about/i)).toBeInTheDocument();
    expect(screen.getByText(/AI Prompt Generator/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/AI temperature setting/i)).toBeInTheDocument();
  });

  test('handles prompt editing and variable detection', async () => {
    render(<App />);
    const user = userEvent.setup();
    
    const editor = screen.getByPlaceholderText(/e.g., Generate a tweet about/i);
    await user.type(editor, 'Hello {{name}}, welcome to {{location}}!');
    
    await waitFor(() => {
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/location/i)).toBeInTheDocument();
    });
  });

  test('tests prompt with Gemini API', async () => {
    render(<App />);
    const user = userEvent.setup();
    
    // Set a prompt
    const editor = screen.getByPlaceholderText(/e.g., Generate a tweet about/i);
    await user.type(editor, 'Test prompt');
    
    // Click test button
    const testButton = screen.getByRole('button', { name: /Test with AI/i });
    await user.click(testButton);
    
    // Verify loading state
    expect(await screen.findByText(/Generating\.\.\./i)).toBeInTheDocument();
    
    // Verify response
    await waitFor(() => {
      expect(screen.getByText(/This is a simulated API response/i)).toBeInTheDocument();
    });
  });

  describe('Prompt Library', () => {
    test('saves and loads prompts', async () => {
      render(<App />);
      const user = userEvent.setup();
      
      // Set a prompt
      const editor = screen.getByPlaceholderText(/e.g., Generate a tweet about/i);
      await user.type(editor, 'Test prompt template');
      
      // Set name
      const nameInput = screen.getByPlaceholderText(/Enter a name for this prompt/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Test Prompt');
      
      // Save prompt
      const saveButton = screen.getByRole('button', { name: /Save to Library/i });
      await user.click(saveButton);
      
      // Verify save
      await waitFor(() => {
        expect(screen.getByText(/Prompt saved/i)).toBeInTheDocument();
      });
      
      // Open library
      const libraryButton = screen.getByText(/My Library/i);
      await user.click(libraryButton);
      
      // Verify saved prompt appears
      await waitFor(() => {
        expect(screen.getByText(/Test Prompt/i)).toBeInTheDocument();
      });
    });
  });

  describe('AI Prompt Generator', () => {
    test('generates prompts with DeepSeek', async () => {
      render(<App />);
      const user = userEvent.setup();
      
      // Set input
      const input = screen.getByPlaceholderText(/Describe what you need/i);
      await user.type(input, 'test input');
      
      // Generate prompts
      const generateButton = screen.getByRole('button', { name: /Generate with DeepSeek/i });
      await user.click(generateButton);
      
      // Verify results
      await waitFor(() => {
        expect(screen.getByText(/Generated prompt 1/i)).toBeInTheDocument();
      });
    });

    test('toggles auto mode', async () => {
      render(<App />);
      const user = userEvent.setup();
      
      // Toggle auto mode
      const autoModeToggle = screen.getByLabelText(/Auto Mode/i);
      await user.click(autoModeToggle);
      
      // Verify auto mode enabled
      expect(screen.getByText(/Auto Mode/i)).toHaveTextContent(/Active/);
    });
  });

  test('persists settings across sessions', async () => {
    // First session
    const { unmount } = render(<App />);
    const user = userEvent.setup();
    
    // Change settings
    const editor = screen.getByPlaceholderText(/e.g., Generate a tweet about/i);
    await user.type(editor, 'Persistent prompt');
    
    // Unmount (simulate closing app)
    unmount();
    
    // Second session
    render(<App />);
    
    // Verify persistence
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e.g., Generate a tweet about/i)).toHaveValue('Persistent prompt');
    });
  });
});