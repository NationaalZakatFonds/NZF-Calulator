declare const STRIPE_KEY: string;

const init = async () => {
    let isIdealPayment = true;
    let isCardPayment = false;

    const translateStripeError = (error) => {
        switch (error) {
            case 'Your card has been declined.':
                return 'Uw kaart is geweigerd.';
            case 'Your card has insufficient funds.':
                return 'Uw kaart heeft onvoldoende saldo.';
            case 'Your card has expired.':
                return 'Uw kaart is verlopen.';
            case 'Your card\'s security code is incorrect.':
                return 'De beveiligingscode van uw kaart is onjuist.';
            case 'An error occurred while processing your card. Try again in a little bit.':
                return 'Er is een fout opgetreden bij het verwerken van uw kaart. Probeer het over een poosje opnieuw.';
            case 'Your card number is invalid.':
                return 'Uw kaartnummer is ongeldig.';
            case 'Your card was declined for making repeated attempts too frequently.':
                return 'Uw kaart is geweigerd vanwege het te vaak herhalen van pogingen.';
            default:
                return 'Er is een onbekende fout opgetreden.';
        }
    };

    const stripe = window.Stripe?.(STRIPE_KEY);
    if (!stripe) return;

    const form = document.querySelector<HTMLFormElement>('[data-element="payment_form"]');
    if (!form) return;

    const ccStripeElement = document.querySelector<HTMLElement>('[data-element="cc_stripe"]');
    if (!ccStripeElement) return;

    const idealStripeElement = document.querySelector<HTMLElement>('[data-element="ideal_stripe"]');
    if (!idealStripeElement) return;


    const elements = stripe.elements();

    // styling of elements check here properties: https://stripe.com/docs/js/appendix/style
    const idealBank = elements.create('idealBank', {
        style: {
            base: {
                iconColor: '#000',
                backgroundColor: '#17535B',
                border: '1px',
                borderColor: '#fff',
                padding: '20px',
                color: '#fff',
                borderRadius: '4px',
                fontWeight: '500',
                fontFamily: "Ekster, sans-serif, Inter, Open Sans, Segoe UI, sans-serif",
                fontSize: '16px',
                fontSmoothing: 'antialiased',
                ':-webkit-autofill': {
                    color: '#fff',
                },
                '::placeholder': {
                    color: '#fff',
                },
            },
            invalid: {
                iconColor: '#fff',
                color: '#fff',
            },
        },
    });
    idealBank.mount(idealStripeElement);

    const card = elements.create('card', {
        style: {
            base: {
                backgroundColor: '#17535B',
                border: '1px',
                padding: '20px',
                borderColor: '#fff',
                color: "#fff",
                iconColor: "#fff",
                fontWeight: 500,
                fontFamily: "Ekster, sans-serif, Inter, Open Sans, Segoe UI, sans-serif",
                fontSize: "16px",
                fontSmoothing: "antialiased",
                "::placeholder": {
                    color: "#fff"
                }
            },
            invalid: {
                iconColor: '#fff',
                color: "#E25950"
            }
        }
    });
    card.mount(ccStripeElement);

    // Get all tab elements
    var tabs = document.querySelectorAll('.w-tab-link');

    // Add click event listeners to each tab
    tabs.forEach(function (tab) {
        tab.addEventListener('click', function (event) {
            // Prevent the default link behavior
            event.preventDefault();

            // Get the data-element attribute value
            var dataElement = tab.getAttribute('data-element');

            // Check if the clicked tab has a specific data-element value
            if (dataElement === 'ideal_button') {
                isIdealPayment = true;
                isCardPayment = false;
            } else if (dataElement === 'card_button') {
                isCardPayment = true;
                isIdealPayment = false;
            }
        });
    });

    idealBank.on("change", (event: any) => {
        const button = document.querySelector('.button-slider-next') as HTMLAnchorElement;
        button.classList.remove('is-disabled');
        button.classList.add("already-removed");
    });


    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const amountStripeElement = document.querySelector<HTMLInputElement>('[data-element="price_amount"]');
        let amountNumber = parseFloat(String(amountStripeElement?.value)) ?? 0;

        if (!amountStripeElement || isNaN(amountNumber)) {
            return;
        }

        try {
            // amountNumber * 100 because stripe does the input price / 100
            let correctStripeAmount = amountNumber * 100;
            const payment_intent = await createPaymentIntent(correctStripeAmount);
            if (!payment_intent) return;

            // Geen elements.submit(): dat hoort bij het Payment Element. Voor losse
            // idealBank- en card-elementen wijst Stripe.js het inmiddels af met
            // "Unable to select session", waardoor de betaling nooit startte.

            const isSadakaPayment = payment_intent.isSadakaPayment ? payment_intent.isSadakaPayment : false;
            console.log(payment_intent)

            let userData = sessionStorage.getItem("userslowlane");
            let userdataclean = userData ? JSON.parse(userData) : {};
        
            userdataclean.paymentIntent_id = payment_intent.paymentIntent_id;
            sessionStorage.setItem("userslowlane", JSON.stringify(userdataclean));
            localStorage.removeItem("user");
            const currentTime = new Date();
            const userObject = {
                ...userdataclean,
                timestamp: currentTime.getTime(), 
                readableTime: currentTime.toString() 
            };
            localStorage.setItem("user", JSON.stringify(userObject));

            let zakatBedrag = parseFloat(userdataclean.zakatPay) || 0;
            let ribaBedrag = parseFloat(userdataclean.ribaValue) || 0;
            let sadaqahBedrag = parseFloat(userdataclean.sadakaValue) || 0;
            let hoogsteBedrag = Math.max(zakatBedrag, ribaBedrag, sadaqahBedrag);
            let paymentType;

            if (hoogsteBedrag === zakatBedrag) {
                paymentType = 'zakat';
            } else if (hoogsteBedrag === ribaBedrag) {
                paymentType = 'riba';
            } else {
                paymentType = 'sadaka';
            }

        
            if (payment_intent.isMonthly) {
                window.location.replace(payment_intent.paymentUrl)
            } else if (isIdealPayment) {
                const resultIdealPayment = await stripe.confirmIdealPayment(payment_intent.clientSecret, {
                    payment_method: {
                        ideal: idealBank
                    },
                    return_url: `https://calculator.nationaalzakatfonds.nl/betaling?paymentType=${paymentType}&paymentSort=ideal`
                })
                // Bij succes stuurt Stripe door naar de bank; alleen een fout komt hier terug.
                if (resultIdealPayment.error) {
                    console.error(resultIdealPayment.error);
                    showPaymentError('De betaling met iDEAL is niet gestart, probeer het opnieuw.');
                }
            } else if (isCardPayment) {
                const resultCardPayment = await stripe.confirmCardPayment(payment_intent.clientSecret, {
                    payment_method: {
                        card: card
                    },
                    return_url: `https://calculator.nationaalzakatfonds.nl/betaling?paymentType=${paymentType}&paymentSort=card`
                })
                if (resultCardPayment.error) {
                    // Vertaal de foutmelding
                    const translatedErrorMessage = translateStripeError(resultCardPayment.error.message) || 'De betaling met uw Creditcard is niet gelukt, probeer het opnieuw.';
                    showPaymentError(translatedErrorMessage);
                }
                else {
                    if (paymentType === "riba")
                        window.location.replace(`https://calculator.nationaalzakatfonds.nl/bedankt-voor-jouw-riba`);
                    else if (paymentType === "zakat")
                        window.location.replace(`https://calculator.nationaalzakatfonds.nl/bedankt-voor-jouw-zakat`);
                    else if (paymentType === "sadaka")
                        window.location.replace(`https://calculator.nationaalzakatfonds.nl/bedankt-voor-jouw-sadaqah`);
                    else
                        window.location.replace(`https://calculator.nationaalzakatfonds.nl/bedankt-voor-jouw-sadaqah`);
                }
            }
        } catch (err) {
            // Zonder dit blijft de knop op "Een ogenblik geduld.." staan: de pagina
            // zet hem pas terug als dit script de tekst weer verandert.
            console.error(err);
            showPaymentError(GENERIC_ERROR);
        }
    })
};

const createPaymentIntent = async (amount) => {
    try {
        let userslowlaneRawData = sessionStorage.getItem("userslowlane");
        let userslowlaneData = userslowlaneRawData ? JSON.parse(userslowlaneRawData) : {};

        // Definieer de sleutels die je wilt hernoemen
        const keyMappings = {
            zakatPay: "zakatBedrag",
            sadakaValue: "sadaqahBedrag",
            ribaValue: "ribaBedrag",
            total: "totaalBedrag",
            anoniem: "anoniem",
            transactiekosten: "transactiekosten",
            datum: "datum",
            fastlane: "fastlane",
            userType: "userType",
            userslowlane: "userslowlane",
            educatiefonds: "educatiefonds",
            noodfonds: "noodfonds",
            woonfonds: "woonfonds",
            maandelijks: "maandelijks",
            voornaam: "voornaam",
            achternaam: "achternaam",
            email: "email"
        };

        if(userslowlaneData.anoniem) {
            delete keyMappings.voornaam;
            delete keyMappings.achternaam;
            delete keyMappings.email;
        }
        
        // Filter en hernoem de data gebaseerd op de mappings
        const filteredAndRenamedData = Object.keys(userslowlaneData)
            .filter(key => Object.keys(keyMappings).includes(key))
            .reduce((obj, key) => {
                const newKey = keyMappings[key] || key; // Gebruik de nieuwe sleutelnaam als deze bestaat, anders de originele sleutel
                obj[newKey] = userslowlaneData[key];
                return obj;
            }, {});

        console.log("userslowlaneData to be sent:", filteredAndRenamedData);

        const response = await fetch('https://nzf-stripe.accounts-545.workers.dev/create-payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: amount,
                currency: 'eur',
                userslowlaneData: JSON.stringify(filteredAndRenamedData) 
            })
        });

        const data = await response.json();
        return data;
    } catch (err) {
        showPaymentError(GENERIC_ERROR);
        return null;
    }
}

const GENERIC_ERROR = "Er is een fout opgetreden. Vernieuw de pagina of controleer je verbinding als het probleem blijft.";

// Zet de knop terug op "Naar betaling" en toont de melding boven de betaaltabs.
const showPaymentError = (message: string) => {
    var buttonText = document.querySelector('.button-text');
    if (buttonText instanceof HTMLElement) {
        buttonText.innerText = "Naar betaling";
    }

    var existingFailedMessage = document.querySelector(".failed-message");
    if (existingFailedMessage && existingFailedMessage.parentNode) {
      existingFailedMessage.parentNode.removeChild(existingFailedMessage);
    }
    var failedMessage = document.createElement("div");
    failedMessage.classList.add("failed-message");
    failedMessage.textContent = message;
    failedMessage.style.color = "red";
    var referenceDiv = document.querySelector(".impact-tabs-menu.w-tab-menu");
    if (referenceDiv && referenceDiv.parentNode) {
      referenceDiv.parentNode.insertBefore(failedMessage, referenceDiv);
    } else {
      console.error("Element or parent of .impact-tabs-menu.w-tab-menu not found");
    }
}


init();
