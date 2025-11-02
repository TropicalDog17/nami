package handlers

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "encoding/json"
    "io"
    "net/http"
    "strconv"
    "strings"

    "github.com/tropicaldog17/nami/internal/models"
    "github.com/tropicaldog17/nami/internal/services"
)

type AIPendingHandler struct {
    service services.AIPendingService
    secret  string
}

func NewAIPendingHandler(service services.AIPendingService, secret string) *AIPendingHandler {
    return &AIPendingHandler{service: service, secret: secret}
}

func (h *AIPendingHandler) HandlePendingActions(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    switch r.Method {
    case "POST":
        h.create(w, r)
    case "GET":
        h.list(w, r)
    default:
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
    }
}

func (h *AIPendingHandler) HandlePendingAction(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    path := strings.TrimPrefix(r.URL.Path, "/api/admin/pending-actions/")
    id := strings.Split(path, "/")[0]
    if id == "" {
        http.Error(w, "missing id", http.StatusBadRequest)
        return
    }
    switch r.Method {
    case "GET":
        a, err := h.service.GetByID(r.Context(), id)
        if err != nil {
            http.Error(w, err.Error(), http.StatusInternalServerError)
            return
        }
        if a == nil {
            http.Error(w, "not found", http.StatusNotFound)
            return
        }
        json.NewEncoder(w).Encode(a)
    default:
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
    }
}

func (h *AIPendingHandler) HandleAccept(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    if r.Method != "POST" { http.Error(w, "Method not allowed", http.StatusMethodNotAllowed); return }
    id := strings.TrimPrefix(r.URL.Path, "/api/admin/pending-actions/")
    id = strings.TrimSuffix(id, "/accept")
    id = strings.TrimSuffix(id, "/")
    if id == "" { http.Error(w, "missing id", http.StatusBadRequest); return }
    resp, err := h.service.Accept(r.Context(), id)
    if err != nil { http.Error(w, err.Error(), http.StatusBadRequest); return }
    json.NewEncoder(w).Encode(resp)
}

func (h *AIPendingHandler) HandleReject(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    if r.Method != "POST" { http.Error(w, "Method not allowed", http.StatusMethodNotAllowed); return }
    id := strings.TrimPrefix(r.URL.Path, "/api/admin/pending-actions/")
    id = strings.TrimSuffix(id, "/reject")
    id = strings.TrimSuffix(id, "/")
    if id == "" { http.Error(w, "missing id", http.StatusBadRequest); return }
    var payload struct{ Reason string `json:"reason"` }
    _ = json.NewDecoder(r.Body).Decode(&payload)
    if err := h.service.Reject(r.Context(), id, payload.Reason); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }
    json.NewEncoder(w).Encode(map[string]any{"id": id, "status": "rejected"})
}

func (h *AIPendingHandler) create(w http.ResponseWriter, r *http.Request) {
    // Verify HMAC signature
    body, err := io.ReadAll(r.Body)
    if err != nil { http.Error(w, "invalid body", http.StatusBadRequest); return }
    defer r.Body.Close()
    sig := r.Header.Get("X-AI-Signature")
    if !h.verify(body, sig) {
        http.Error(w, "invalid signature", http.StatusUnauthorized)
        return
    }
    // Parse payload (from ai-service)
    var payload struct {
        Source     string          `json:"source"`
        RawInput   string          `json:"raw_input"`
        ToonText   *string         `json:"toon_text"`
        ActionJSON json.RawMessage `json:"action_json"`
        Confidence *float64        `json:"confidence"`
        BatchID    *string         `json:"batch_id"`
        Meta       json.RawMessage `json:"meta"`
    }
    if err := json.Unmarshal(body, &payload); err != nil {
        http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
        return
    }
    a := &models.AIPendingAction{
        Source:     payload.Source,
        RawInput:   payload.RawInput,
        ToonText:   payload.ToonText,
        ActionJSON: payload.ActionJSON,
        Confidence: payload.Confidence,
        BatchID:    payload.BatchID,
        Meta:       payload.Meta,
        Status:     "pending",
    }
    if err := h.service.Create(r.Context(), a); err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(map[string]string{"id": a.ID})
}

func (h *AIPendingHandler) list(w http.ResponseWriter, r *http.Request) {
    q := r.URL.Query()
    status := q.Get("status")
    limit, _ := strconv.Atoi(q.Get("limit"))
    offset, _ := strconv.Atoi(q.Get("offset"))
    list, err := h.service.List(r.Context(), status, limit, offset)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    json.NewEncoder(w).Encode(list)
}

func (h *AIPendingHandler) verify(body []byte, sig string) bool {
    if h.secret == "" || sig == "" { return false }
    mac := hmac.New(sha256.New, []byte(h.secret))
    mac.Write(body)
    expected := hex.EncodeToString(mac.Sum(nil))
    return hmac.Equal([]byte(expected), []byte(sig))
}


