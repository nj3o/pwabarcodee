const operatingSystemDisplay = document.getElementById('operatingSystem');
const captureBtn = document.getElementById('captureBtn');
const scanBarcodeBtn = document.getElementById('scanBarcodeBtn');
const refreshLocationBtn = document.getElementById('refreshLocationBtn');
const switchButton = document.getElementById('switchButton');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const textArea = document.getElementById('textArea');
const resultElement = document.getElementById('result');
const userAgent = navigator.userAgent;
const os = getOS(userAgent);
let currentStream;
let codeReader;
let scannedBarcodeImage = null; 
let isGeneratingPDF = false;
let scannedBarcodeData = null;
let popupOpen = false;

operatingSystemDisplay.textContent = 'Operating System: ' + os;

// Start Video Funktion
function startVideo(stream) {
    video.srcObject = stream;
    currentStream = stream;
}

// Switch Camera Funktion
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function showButtonOnMobile(buttonId) {
    const button = document.getElementById(buttonId);
    if (isMobileDevice()) {
        button.style.display = 'block';
    } else {
        button.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    showButtonOnMobile('switchButton');
    scanBarcode();
    setupEventListeners();
    initializeCamera();
});

async function initializeCamera() {
    const constraints = {
        audio: false,
        video: {
            facingMode: video.getAttribute('facing-mode') || 'environment'
        }
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        startVideo(stream);
    } catch (err) {
        console.error('Error accessing camera:', err);
    }
}

switchButton.addEventListener('click', async () => {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }
    const facingMode = video.getAttribute('facing-mode') === 'user' ? 'environment' : 'user';
    video.setAttribute('facing-mode', facingMode);
    await initializeCamera();
});

// Setup Event Listeners Funktion
function setupEventListeners() {
    captureBtn.addEventListener('click', () => {
        playBeepAndVibrate();
        captureImageForOCR();
    });

    scanBarcodeBtn.addEventListener('click', () => {
        playBeepAndVibrate();
        scanBarcode();
    });

    refreshLocationBtn.addEventListener('click', () => {
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(fetchAndDisplayAddress, showError);
        } else {
            document.getElementById('locationDisplay').textContent = 'Geolocation nicht unterstützt.';
        }
    });

    generatePdfBtn.addEventListener('click', () => {
        openPopup((filename, firmenname, adresse, zweck) => {
            if (scannedBarcodeData) {
                generatePDF(filename, firmenname, adresse, zweck, scannedBarcodeData.text, scannedBarcodeData.image);
                scannedBarcodeData = null; // Zurücksetzen der gescannten Daten nach der PDF-Erstellung
            } else {
                console.log('Kein gescannter Barcode vorhanden.');
            }
        });
    });

    generateDocxBtn.addEventListener('click', () => {
        openDocxPopup((filename, firmenname, adresse, zweck, dropdownValue) => {
            if (isGeneratingDOCX) {
                console.log('Dokument wird bereits generiert. Bitte warten.');
                return; // Vermeide die erneute Erstellung eines Dokuments, wenn bereits eines generiert wird
            }

            isGeneratingDOCX = true; // Markiere den Beginn der Dokument-Erstellung

            generateDOCX(filename, firmenname, adresse, zweck, dropdownValue, scannedBarcodeData);

            isGeneratingDOCX = false; // Markiere das Ende der Dokument-Erstellung
        });
    });
}

function getOS(userAgent) {
    if (userAgent.match(/Android/i)) return 'Android';
    if (userAgent.match(/iPhone|iPad|iPod/i)) return 'iOS';
    if (userAgent.match(/Windows/i)) return 'Windows';
    if (userAgent.match(/Macintosh|Mac OS X/i)) return 'Mac OS';
    if (userAgent.match(/Linux/i)) return 'Linux';
    return 'Unbekannt';
}

// Texterkennung
function captureImageForOCR() {
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

    // Rauschentfernung
    const noiseRemovedData = removeNoise(imageData);

    // Binarisierung
    const binarizedData = binarizeImage(noiseRemovedData);
    context.putImageData(binarizedData, 0, 0);

    const imageDataUrl = canvas.toDataURL('image/png');

    if ('vibrate' in navigator) {
        navigator.vibrate([200]); // Vibration auslösen
    }
    canvas.style.backgroundColor = '#ffcc00'; // Hintergrundfarbe ändern, um Erfolg anzuzeigen

    Tesseract.recognize(
        imageDataUrl,
        'deu',
        {
            logger: m => console.log(m)
        }
    ).then(({ data: { text } }) => {
        textArea.value = text; // Erkannten Text anzeigen
        canvas.style.backgroundColor = ''; // Hintergrundfarbe zurücksetzen

        // Ändere die Hintergrundfarbe des Videos für 1 Sekunde
        video.style.backgroundColor = 'lightgreen';
        setTimeout(() => {
            video.style.backgroundColor = '';
        }, 1000);

        playBeepAndVibrate(); // Beep-Sound abspielen
    });
}

function scanBarcode() {
    Quagga.init({
        inputStream: {
            name: "Live",
            type: "LiveStream",
            target: document.querySelector('#video'),
            constraints: {
                facingMode: "environment"
            },
        },
        decoder: {
            readers: ["code_128_reader", "ean_reader", "ean_8_reader", "code_39_reader", "codabar_reader", "upc_reader"]
        },
    }, function (err) {
        if (err) {
            console.log(err);
            return;
        }
        Quagga.start();
    });

    Quagga.onProcessed(function (result) {
        const drawingCtx = Quagga.canvas.ctx.overlay;
        const drawingCanvas = Quagga.canvas.dom.overlay;

        if (result) {
            if (result.boxes) {
                drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
                result.boxes.filter(function (box) {
                    return box !== result.box;
                }).forEach(function (box) {
                    Quagga.ImageDebug.drawPath(box, { x: 0, y: 1 }, drawingCtx, {
                        color: "green",
                        lineWidth: 2
                    });
                });
            }

            if (result.box) {
                Quagga.ImageDebug.drawPath(result.box, { x: 0, y: 1 }, drawingCtx, {
                    color: "#00F",
                    lineWidth: 2
                });
            }

            if (result.codeResult && result.codeResult.code) {
                resultElement.innerText = `Barcode: ${result.codeResult.code}`;
                playBeepAndVibrate(); 
            }
        }
    });

    Quagga.onDetected(function (result) {
        const code = result.codeResult.code;
        console.log(`Barcode erkannt: ${code}`);
        resultElement.innerText = `Erkannter Barcode: ${code}`;
    
        // Speichere den gescannten Barcode und das Bild des Barcodes
        const drawingCanvas = document.createElement('canvas');
        drawingCanvas.width = video.videoWidth;
        drawingCanvas.height = video.videoHeight;
        const drawingCtx = drawingCanvas.getContext('2d');
        drawingCtx.drawImage(video, 0, 0, drawingCanvas.width, drawingCanvas.height);
        const imageDataUrl = drawingCanvas.toDataURL('image/png');
    
        scannedBarcodeData = {
            text: code,
            image: imageDataUrl
        };
    });
    
}


// Funktion zum Abspielen von Ton und Vibration
function playBeepAndVibrate() {
    const beepSound = document.getElementById('beepSound');
    beepSound.play();

    if ('vibrate' in navigator) {
        navigator.vibrate([200]);
    }
}

// Geolocation
function fetchAndDisplayAddress(position) {
    const { latitude, longitude } = position.coords;
    const apiKey = 'b526254236ad47a1aebff6e137ad1790';
    const apiUrl = `https://api.opencagedata.com/geocode/v1/json?q=${latitude}+${longitude}&key=${apiKey}`;
    fetch(apiUrl)
        .then(response => response.json())
        .then(data => {
            const address = data.results.length > 0 ? data.results[0].formatted : 'Keine Adresse gefunden.';
            document.getElementById('locationDisplay').textContent = 'Adresse: ' + address;
        })
        .catch(() => {
            document.getElementById('locationDisplay').textContent = 'Adressabruf fehlgeschlagen.';
        });
}

function showError(error) {
    document.getElementById('locationDisplay').textContent = 'Fehler: ' + error.message;
}

navigator.mediaDevices.getUserMedia({ video: true })
    .then(startVideo)
    .catch(err => console.error("Failed to get video stream:", err));

// Funktion zur Berechnung der DPI eines Bildes
function calculateDPI(width, height) {
    const screenWidthInches = window.screen.width / window.devicePixelRatio;
    const screenHeightInches = window.screen.height / window.devicePixelRatio;
    const diagonalInches = Math.sqrt(Math.pow(screenWidthInches, 2) + Math.pow(screenHeightInches, 2));
    return Math.max(width, height) / diagonalInches;
}

// Funktion zum Skalieren eines Bildes auf 300 DPI
function scaleImageTo300DPI(width, height) {
    const scaledWidth = (width / calculateDPI(width, height)) * 300;
    const scaledHeight = (height / calculateDPI(width, height)) * 300;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = scaledWidth;
    tempCanvas.height = scaledHeight;
    tempCanvas.getContext('2d').drawImage(video, 0, 0, scaledWidth, scaledHeight);
    return tempCanvas;
}

// Funktion zur Binarisierung eines Bildes
function binarizeImage(imageData) {
    const threshold = 127; // Schwellenwert für die Binarisierung
    const binaryData = new Uint8ClampedArray(imageData.data.length);
    for (let i = 0; i < imageData.data.length; i += 4) {
        const grayValue = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
        const binaryValue = grayValue > threshold ? 255 : 0;
        binaryData[i] = binaryData[i + 1] = binaryData[i + 2] = binaryValue;
        binaryData[i + 3] = 255; // Alpha-Wert beibehalten
    }
    return new ImageData(binaryData, imageData.width, imageData.height);
}

// Funktion zur Rauschentfernung eines Bildes (Median-Filter)
function removeNoise(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const pixels = imageData.data;
    const output = new Uint8ClampedArray(pixels.length);

    function getPixel(x, y) {
        if (x < 0 || x >= width || y < 0 || y >= height) {
            return [255, 255, 255]; 
        }
        const index = (y * width + x) * 4;
        return [pixels[index], pixels[index + 1], pixels[index + 2]];
    }

    function median(values) {
        values.sort((a, b) => a - b);
        const middle = Math.floor(values.length / 2);
        return values.length % 2 !== 0 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
    }

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const neighbors = [];
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    neighbors.push(getPixel(x + dx, y + dy));
                }
            }
            const reds = neighbors.map(p => p[0]);
            const greens = neighbors.map(p => p[1]);
            const blues = neighbors.map(p => p[2]);

            const index = (y * width + x) * 4;
            output[index] = median(reds);
            output[index + 1] = median(greens);
            output[index + 2] = median(blues);
            output[index + 3] = pixels[index + 3]; 
        }
    }

    return new ImageData(output, width, height);
}

// Zoom-Funktionalität
let zoomLevel = 1;

function setZoom(level) {
    if (currentStream) {
        const track = currentStream.getVideoTracks()[0];
        const capabilities = track.getCapabilities();
        if (capabilities.zoom) {
            zoomLevel = Math.min(Math.max(level, capabilities.zoom.min), capabilities.zoom.max);
            track.applyConstraints({ advanced: [{ zoom: zoomLevel }] });
        } else {
            console.log('Zoom wird von dieser Kamera nicht unterstützt.');
        }
    }
}

// Setup Event Listeners für die Zoom-Buttons
document.getElementById('zoomInBtn').addEventListener('click', () => {
    setZoom(zoomLevel + 0.2);
});

document.getElementById('zoomOutBtn').addEventListener('click', () => {
    setZoom(zoomLevel - 0.2);
});

// Funktion zum Öffnen des Popups
function openPopup(callback) {
    if (popupOpen) {
        return; // Popup ist bereits geöffnet, verlasse die Funktion
    }
    
    popupOpen = true; // Markiere das Popup als geöffnet

    const popup = document.createElement('div');
    popup.classList.add('popup');

    const popupContent = `
        <h3>Dateiname eingeben und weitere Informationen:</h3>
        <label for="filename">Dateiname:</label>
        <input type="text" id="filename" required><br><br>
        <label for="firmenname">Firmen Name:</label>
        <input type="text" id="firmenname" required><br><br>
        <label for="adresse">Adresse:</label>
        <input type="text" id="adresse" required><br><br>
        <label for="zweck">Zweck:</label>
        <input type="text" id="zweck" required><br><br>
        <label for="dropdown">Grund:</label>
        <select id="dropdown">
            <option value="Messung">Messung</option>
            <option value="Optimierung">Optimierung</option>
            <option value="Testen">Testen</option>
        </select><br><br>
        <button id="submitBtn">PDF erstellen</button>
    `;
    popup.innerHTML = popupContent;

    document.body.appendChild(popup);

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.addEventListener('click', () => {
        const filename = document.getElementById('filename').value;
        const firmenname = document.getElementById('firmenname').value;
        const adresse = document.getElementById('adresse').value;
        const zweck = document.getElementById('zweck').value;
        const dropdownValue = document.getElementById('dropdown').value;
        callback(filename, firmenname, adresse, zweck, dropdownValue);
        document.body.removeChild(popup);
        popupOpen = false; // Markiere das Popup als geschlossen
    });
}

// Event Listener für den PDF Button
document.getElementById('generatePdfBtn').addEventListener('click', () => {
    openPopup((filename, firmenname, adresse, zweck, dropdownValue) => {
        if (isGeneratingPDF) {
            console.log('PDF wird bereits generiert. Bitte warten.');
            return; // Vermeide die erneute Erstellung eines PDFs, wenn bereits eines generiert wird
        }
        
        isGeneratingPDF = true; // Markiere den Beginn der PDF-Erstellung

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.text("Firmen Name: " + firmenname, 10, 10);
        doc.text("Adresse: " + adresse, 10, 20);
        doc.text("Zweck: " + zweck, 10, 30);
        doc.text("Grund: " + dropdownValue, 10, 40); // Anpassung: Dropdown-Wert hinzufügen

        // Füge das Bild des Barcodes hinzu, falls vorhanden
        if (scannedBarcodeData) {
            doc.text("Barcode Nummer: " + scannedBarcodeData.text, 10, 50);
            if (scannedBarcodeData.image) {
                doc.addImage(scannedBarcodeData.image, 'PNG', 10, 60, 100, 50); // Hier kannst du die Position und Größe des Bildes anpassen
            }
        }

        doc.save(filename + ".pdf");

        isGeneratingPDF = false; // Markiere das Ende der PDF-Erstellung
    });
});

function generateDOCX(filename, firmenname, adresse, zweck, dropdownValue, barcodeData) {
    const doc = new jsdocx.Document();

    doc.addParagraph(new jsdocx.Paragraph().addRun(new jsdocx.TextRun(`Firmen Name: ${firmenname}`).bold()));
    doc.addParagraph(new jsdocx.Paragraph().addRun(new jsdocx.TextRun(`Adresse: ${adresse}`)));
    doc.addParagraph(new jsdocx.Paragraph().addRun(new jsdocx.TextRun(`Zweck: ${zweck}`)));
    doc.addParagraph(new jsdocx.Paragraph().addRun(new jsdocx.TextRun(`Grund: ${dropdownValue}`)));

    if (barcodeData && barcodeData.text) {
        doc.addParagraph(new jsdocx.Paragraph().addRun(new jsdocx.TextRun(`Barcode Nummer: ${barcodeData.text}`)));
    }

    if (barcodeData && barcodeData.image) {
        fetch(barcodeData.image)
            .then(res => res.blob())
            .then(blob => {
                const reader = new FileReader();
                reader.onload = function () {
                    const base64Image = reader.result.split(',')[1];
                    const image = new jsdocx.Image(base64Image, 'image/png');
                    doc.addImage(image, { width: 100, height: 50, floating: { horizontalPosition: { offset: 10 }, verticalPosition: { offset: 60 } } });
                    saveDOCX(doc, filename);
                };
                reader.readAsDataURL(blob);
            });
    } else {
        saveDOCX(doc, filename);
    }
}

// Hilfsfunktion zum Speichern des DOCX-Dokuments
function saveDOCX(doc, filename) {
    const packer = new jsdocx.Packer();
    packer.toBlob(doc).then(blob => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename + ".docx";
        link.click();
    });
}

// Event Listener für den DOCX Button
document.getElementById('generateDocxBtn').addEventListener('click', () => {
    openPopup((filename, firmenname, adresse, zweck, dropdownValue) => {
        if (isGeneratingPDF) {
            console.log('Dokument wird bereits generiert. Bitte warten.');
            return; 
        }
        
        isGeneratingPDF = true; 

        generateDOCX(filename, firmenname, adresse, zweck, dropdownValue, scannedBarcodeData);

        isGeneratingPDF = false; 
    });
});