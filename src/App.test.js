import { render, screen, waitFor, within } from '@testing-library/react';
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
  });
  
  // Mock fetch globally
  global.fetch = jest.fn();
});

beforeEach(() => {
  window.localStorage.clear();
  jest.clearAllMocks();
  
  // Mock successful API responses by default
  global.fetch.mockImplementation(() =>
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
    
    const nameInput = screen.getByLabelText(/name/i);
    await user.type(nameInput, 'John');
    expect(nameInput).toHaveValue('John');
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

    test('deletes prompts', async () => {
      // Pre-populate with a prompt
      window.localStorage.setItem('promptStudioPrompts', JSON.stringify([{
        id: '1',
        name: 'Saved Prompt',
        template: 'Saved template',
        temperature: 0.7,
        savedAt: Date.now()
      }]));
      
      render(<App />);
      const user = userEvent.setup();
      
      // Open library
      const libraryButton = screen.getByText(/My Library/i);
      await user.click(libraryButton);
      
      // Hover to show delete button
      const promptItem = await screen.findByText(/Saved Prompt/i);
      await user.hover(promptItem);
      
      // Delete prompt
      const deleteButton = await screen.findByRole('button', { name: /Delete/i });
      await user.click(deleteButton);
      
      // Confirm deletion
      const confirmButton = await screen.findByRole('button', { name: /Delete/i });
      await user.click(confirmButton);
      
      // Verify deletion
      await waitFor(() => {
        expect(screen.queryByText(/Saved Prompt/i)).not.toBeInTheDocument();
        expect(screen.getByText(/Prompt deleted/i)).toBeInTheDocument();
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
        expect(screen.getByText(/Generated prompt 2/i)).toBeInTheDocument();
        expect(screen.getByText(/Generated prompt 3/i)).toBeInTheDocument();
      });
    });

    test('toggles auto mode', async () => {
      render(<App />);
      const user = userEvent.setup();
      
      // Verify auto mode off by default
      expect(screen.getByText(/Auto Mode/i)).toHaveTextContent(/Off/);
      
      // Toggle auto mode
      const autoModeToggle = screen.getByLabelText(/Auto Mode/i);
      await user.click(autoModeToggle);
      
      // Verify auto mode enabled
      expect(screen.getByText(/Auto Mode/i)).toHaveTextContent(/Active/);
    });

    test('rates generated prompts', async () => {
      render(<App />);
      const user = userEvent.setup();
      
      // Generate some prompts
      const input = screen.getByPlaceholderText(/Describe what you need/i);
      await user.type(input, 'test input');
      const generateButton = screen.getByRole('button', { name: /Generate with DeepSeek/i });
      await user.click(generateButton);
      
      // Wait for prompts to appear
      await screen.findByText(/Generated prompt 1/i);
      
      // Rate a prompt
      const promptContainer = screen.getByText(/Generated prompt 1/i).closest('div');
      const stars = within(promptContainer).getAllByRole('button', { name: /Rate \d stars/i });
      await user.click(stars[4]); // Click 5th star
      
      // Verify rating UI update
      expect(stars[4]).toContainHTML('⭐'); // Should now be a filled star
    });
  });

  test('persists settings across sessions', async () => {
    // First session
    const { unmount } = render(<App />);
    const user = userEvent.setup();
    
    // Change settings
    const editor = screen.getByPlaceholderText(/e.g., Generate a tweet about/i);
    await user.type(editor, 'Persistent prompt');
    
    const nameInput = screen.getByPlaceholderText(/Enter a name for this prompt/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Persistent Prompt');
    
    // Change temperature
    const tempSlider = screen.getByLabelText(/Temperature/i);
    fireEvent.change(tempSlider, { target: { value: '0.9' } });
    
    // Unmount (simulate closing app)
    unmount();
    
    // Second session
    render(<App />);
    
    // Verify persistence
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e.g., Generate a tweet about/i)).toHaveValue('Persistent prompt');
      expect(screen.getByPlaceholderText(/Enter a name for this prompt/i)).toHaveValue('Persistent Prompt');
      expect(screen.getByLabelText(/Temperature/i)).toHaveValue('0.9');
    });
  });

  test('renders learn react link', () => {
    render(<App />);
    const linkElement = screen.getByText(/learn react/i);
    expect(linkElement).toBeInTheDocument();
  });
});