const API_HEADERS = {
    'x-rapidapi-key': '4fbc13fa91msh7eaf58f815807b2p1d89f0jsnec07b5b547c3',
    'x-rapidapi-host': 'booking-com15.p.rapidapi.com'
};

// Auth0 Configuration
let auth0Client;
const configureClient = async () => {
    try {
        auth0Client = await createAuth0Client({
            domain: "dev-h4hncqco2n4yrt6z.us.auth0.com",
            client_id: "eUlv5NFe6rjQbLztvS8MsikdIlznueaU",
            redirect_uri: window.location.origin + "/indexsignedin.html" // Fixed redirect URI
        });
        console.log("Auth0 client configured successfully");
    } catch (error) {
        console.error("Auth0 configuration error:", error);
        showError('Authentication failed. Please refresh the page.');
        throw error;
    }
};

// Add Auth0 callback handler
const handleAuthRedirect = async () => {
    try {
        const query = window.location.search;
        if (query.includes("code=") && query.includes("state=")) {
            await auth0Client.handleRedirectCallback();
            window.history.replaceState({}, document.title, "/indexsignedin.html");
        }
    } catch (error) {
        console.error("Auth redirect error:", error);
        showError('Authentication failed. Please try again.');
        throw error;
    }
};

const signOut = async () => {
    try {
        if (auth0Client) {
            await auth0Client.logout({
                returnTo: window.location.origin + "/index.html" // Explicit logout redirect
            });
        }
    } catch (error) {
        console.error("Sign out error:", error);
        showError('Error signing out. Please try again.');
    }
};

// Add login function
const signIn = async () => {
    await auth0Client.loginWithRedirect({
        redirect_uri: window.location.origin + "/indexsignedin.html"
    });
};

// Rest of your existing code remains the same (IATA mapping, ML functions, API calls, etc.)
// ... [Keep all existing code from getCityName() through showError()] ...

// Updated initialization with proper auth handling
window.onload = async () => {
    try {
        await configureClient();
        await handleAuthRedirect(); // Critical addition
        
        const user = await auth0Client.getUser();
        
        if (!user) {
            // Only redirect if we're not already on index.html
            if (!window.location.pathname.endsWith("index.html")) {
                window.location.href = 'index.html';
            }
            return;
        }

        // Update login/logout buttons
        document.getElementById('signOutBtn').addEventListener('click', signOut);
        document.getElementById('loginBtn')?.addEventListener('click', signIn);

        // Only show authenticated content if on indexsignedin.html
        if (window.location.pathname.endsWith("indexsignedin.html")) {
            document.body.classList.add('authenticated');
            initializeAuthenticatedFeatures(user);
        }

        // Your existing holiday button handler
        document.getElementById('findMyHolidayButton')?.addEventListener('click', async () => {
            // ... [Keep existing click handler logic] ...
        });
    } catch (error) {
        showError('Failed to initialize application. Please try again.');
        console.error('Initialization error:', error);
    }
};

// Helper function for authenticated features
function initializeAuthenticatedFeatures(user) {
    // Add any user-specific UI initialization here
    document.getElementById('userProfile').textContent = user.name;
    // ... other authenticated UI elements ...
}

// IATA to City Mapping
const getCityName = (iataCode) => {
    const mapping = { 
        SYD: 'Sydney',
        PAR: 'Paris',
        JFK: 'New York',
        LHR: 'London',
        CDG: 'Paris',
        HND: 'Tokyo'
    };
    return mapping[iataCode] || iataCode;
};

// Personalization Algorithm
const preprocessUserData = (user) => {
    const preferences = user.preferences ? Object.values(user.preferences) : [0.5, 0.5, 0.5];
    return {
        name: user.name,
        email: user.email,
        preferences: preferences
    };
};

const trainModel = async (userData) => {
    try {
        const model = tf.sequential({
            layers: [
                tf.layers.dense({ 
                    units: 8, 
                    activation: 'relu', 
                    inputShape: [userData.preferences.length + 2] 
                }),
                tf.layers.dense({ units: 4, activation: 'relu' }),
                tf.layers.dense({ units: 1, activation: 'sigmoid' })
            ]
        });

        model.compile({ 
            optimizer: 'adam', 
            loss: 'meanSquaredError',
            metrics: ['accuracy'] 
        });

        const xs = tf.tensor2d([[
            ...userData.preferences,
            parseFloat(userData.budget) / 5000,
            new Date(userData.checkInDate).getMonth() / 11
        ]]);

        const ys = tf.tensor2d([[1]]);
        await model.fit(xs, ys, { 
            epochs: 10,
            batchSize: 1,
            validationSplit: 0.2 
        });
        
        return model;
    } catch (error) {
        console.error("Model training error:", error);
        throw new Error('Failed to generate recommendations');
    }
};

const generateRecommendations = async (user, inputs) => {
    try {
        const processedData = {
            ...preprocessUserData(user),
            ...inputs
        };

        const model = await trainModel(processedData);
        const input = tf.tensor2d([[
            ...processedData.preferences,
            parseFloat(inputs.budget) / 5000,
            new Date(inputs.checkInDate).getMonth() / 11
        ]]);

        const prediction = model.predict(input);
        return mapRecommendationToDestination(prediction.dataSync()[0]);
    } catch (error) {
        console.error("Recommendation error:", error);
        throw new Error('Failed to generate travel recommendations');
    }
};

const mapRecommendationToDestination = (score) => {
    const destinations = [
        { code: 'PAR', threshold: 0.8, name: 'Paris' },
        { code: 'JFK', threshold: 0.6, name: 'New York' },
        { code: 'LHR', threshold: 0.4, name: 'London' },
        { code: 'SYD', threshold: 0.2, name: 'Sydney' }
    ];

    return destinations.reduce((closest, dest) => {
        return score >= dest.threshold ? dest : closest;
    }, destinations[destinations.length - 1]).code;
};

// API Functions
const searchRoundtripFlights = async (fromIATA, toIATA, departureDate, returnDate) => {
    try {
        const url = new URL('https://booking-com15.p.rapidapi.com/api/v1/flights/searchFlights');
        url.searchParams.append('fromId', fromIATA);
        url.searchParams.append('toId', toIATA);
        url.searchParams.append('departDate', departureDate);
        url.searchParams.append('returnDate', returnDate);
        url.searchParams.append('currency', 'USD');

        console.log('Flight Search URL:', url.toString());
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, { 
            method: 'GET', 
            headers: API_HEADERS,
            signal: controller.signal 
        });
        clearTimeout(timeoutId);
        console.log('Flight API Status:', response.status, response.statusText);

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        console.log('Flights API Response:', data);

        // Check for API-reported errors first
        if (data.status === false) {
            throw new Error(
                Array.isArray(data.message)
                    ? data.message.join(', ')
                    : data.message || 'Flight search failed'
            );
        }

        // Then ensure the expected data structure is present
        if (!data.data || !data.data.flights) {
            throw new Error('Invalid flight data structure');
        }

        return data;
    } catch (error) {
        console.error('Flight API Error:', error);
        return { status: false, message: error.message };
    }
};

const fetchHotelData = async (destinationIATA, budget, checkInDate, checkOutDate) => {
    try {
        const cityName = getCityName(destinationIATA);
        const destUrl = new URL('https://booking-com15.p.rapidapi.com/api/v1/hotels/searchDestination');
        destUrl.searchParams.append('query', cityName);

        const destResponse = await fetch(destUrl, { 
            method: 'GET', 
            headers: API_HEADERS 
        });

        if (!destResponse.ok) throw new Error(`Destination lookup failed: ${destResponse.status}`);
        
        const destData = await destResponse.json();
        console.log('Destination API Response:', destData);

        const destId = destData.data?.[0]?.dest_id;
        const destType = destData.data?.[0]?.dest_type;
        if (!destId) throw new Error('No destination ID found');

        if (!destData.data || !Array.isArray(destData.data)) {
            throw new Error('Invalid destination response');
        }

        const hotelUrl = new URL('https://booking-com15.p.rapidapi.com/api/v1/hotels/searchHotels');
        hotelUrl.searchParams.append('dest_id', destId);
        hotelUrl.searchParams.append('search_type', 'CITY');
        hotelUrl.searchParams.append('date_from', checkInDate);
        hotelUrl.searchParams.append('date_to', checkOutDate);
        hotelUrl.searchParams.append('price_max', budget);
        hotelUrl.searchParams.append('adults', '1');
        hotelUrl.searchParams.append('currency', 'USD');
        hotelUrl.searchParams.append('dest_type', destType);

        console.log('Destination Search URL:', destUrl.toString());
        console.log('Hotel Search URL:', hotelUrl.toString());

        const hotelResponse = await fetch(hotelUrl, { 
            method: 'GET', 
            headers: API_HEADERS 
        });

        if (!hotelResponse.ok) throw new Error(`Hotel search failed: ${hotelResponse.status}`);
        
        const hotelData = await hotelResponse.json();
        console.log('Hotels API Response:', hotelData);

        if (hotelData.status === false) {
            throw new Error(
                Array.isArray(hotelData.message)
                    ? hotelData.message.map(m => typeof m === 'object' ? JSON.stringify(m) : m).join(', ')
                    : hotelData.message || 'Hotel search error'
            );
        }

        return hotelData;
    } catch (error) {
        console.error('Hotel API Error:', error);
        return { status: false, message: error.message };
    }
};

// Main Workflow
const personalizeContent = async (user) => {
    try {
        const inputs = {
            checkInDate: document.getElementById('holidayDate').value,
            checkOutDate: document.getElementById('returnDate').value,
            departureLocation: document.getElementById('departureLocation').value.toUpperCase(),
            budget: document.getElementById('budget').value
        };

        // Validate dates
        if (new Date(inputs.checkOutDate) < new Date(inputs.checkInDate)) {
            throw new Error('Check-out date must be after check-in date');
        }

        // Validate budget
        if (!/^\d+$/.test(inputs.budget) || inputs.budget < 100) {
            throw new Error('Budget must be a number greater than $100');
        }

        const destinationIATA = await generateRecommendations(user, inputs);
        console.log('Recommended destination:', destinationIATA);

        const [flights, hotels] = await Promise.all([
            searchRoundtripFlights(
                inputs.departureLocation, 
                destinationIATA, 
                inputs.checkInDate,
                inputs.checkOutDate
            ),
            fetchHotelData(destinationIATA, inputs.budget, inputs.checkInDate, inputs.checkOutDate)
        ]);

        return {
            destination: destinationIATA,
            flights: flights.data ? flights : { status: false, message: 'No flight data' },
            hotels: hotels.data ? hotels : { status: false, message: 'No hotel data' },
            dates: { checkIn: inputs.checkInDate, checkOut: inputs.checkOutDate },
            budget: inputs.budget
        };
    } catch (error) {
        console.error('Personalization error:', error);
        throw error;
    }
};

// UI Handlers
const showLoading = (show = true) => {
    const loadingIndicator = document.querySelector('.loading-indicator');
    if (loadingIndicator) {
        loadingIndicator.hidden = !show;
    } else {
        console.warn("Loading indicator element not found");
    }
    const holidayButton = document.getElementById('findMyHolidayButton');
    if (holidayButton) {
        holidayButton.disabled = show;
    } else {
        console.warn("findMyHolidayButton element not found");
    }
};

const showError = (message) => {
    const errorElement = document.querySelector('.api-error');
    errorElement.textContent = message;
    errorElement.hidden = false;
    setTimeout(() => errorElement.hidden = true, 5000);
};

// Initialize Application
window.onload = async () => {
    try {
        await configureClient();
        await handleAuthRedirect(); // Critical addition
        
        const user = await auth0Client.getUser();
        
        if (!user) {
            // Only redirect if we're not already on index.html
            if (!window.location.pathname.endsWith("index.html")) {
                window.location.href = 'index.html';
            }
            return;
        }

        // Update login/logout buttons
        document.getElementById('signOutBtn').addEventListener('click', signOut);
        document.getElementById('loginBtn')?.addEventListener('click', signIn);

        // Only show authenticated content if on indexsignedin.html
        if (window.location.pathname.endsWith("indexsignedin.html")) {
            document.body.classList.add('authenticated');
            initializeAuthenticatedFeatures(user);
        }

        // Your existing holiday button handler
        document.getElementById('findMyHolidayButton')?.addEventListener('click', async () => {
            try {
                showLoading();
                const results = await personalizeContent(user);
                
                document.getElementById('results').innerHTML = `
                    <h3>Your ${results.destination} Package</h3>
                    <p>Dates: ${results.dates.checkIn} to ${results.dates.checkOut}</p>
                    <p>Budget: $${results.budget}</p>
                    <div class="results-content">
                        <div class="flights-results">
                            <h4>Flights</h4>
                            ${results.flights.status 
                                ? `<pre>${JSON.stringify(results.flights.data?.slice(0, 2), null, 2)}</pre>` 
                                : `<p class="error">${results.flights.message}</p>`}
                        </div>
                        <div class="hotels-results">
                            <h4>Hotels</h4>
                            ${results.hotels.status 
                                ? `<pre>${JSON.stringify(results.hotels.data?.slice(0, 2), null, 2)}</pre>` 
                                : `<p class="error">${results.hotels.message}</p>`}
                        </div>
                    </div>
                `;
            } catch (error) {
                showError(error.message);
            } finally {
                showLoading(false);
            }
        });
    } catch (error) {
        showError('Failed to initialize application. Please try again.');
        console.error('Initialization error:', error);
    }
};

