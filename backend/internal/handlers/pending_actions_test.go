package handlers

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/tropicaldog17/nami/internal/models"
	"github.com/tropicaldog17/nami/internal/services"
)

type mockAIPendingService struct {
	created *models.AIPendingAction
	listed  []*models.AIPendingAction
}

func (m *mockAIPendingService) Create(_ context.Context, a *models.AIPendingAction) error {
	m.created = a
	return nil
}
func (m *mockAIPendingService) GetByID(_ context.Context, id string) (*models.AIPendingAction, error) {
	for _, x := range m.listed {
		if x.ID == id {
			return x, nil
		}
	}
	return nil, nil
}
func (m *mockAIPendingService) List(_ context.Context, status string, limit, offset int) ([]*models.AIPendingAction, error) {
	return m.listed, nil
}
func (m *mockAIPendingService) Accept(_ context.Context, id string) (*models.ActionResponse, error) {
	return &models.ActionResponse{Action: models.ActionSpendVND}, nil
}
func (m *mockAIPendingService) Reject(_ context.Context, id, reason string) error { return nil }

var _ services.AIPendingService = (*mockAIPendingService)(nil)

func TestVerifyHMAC(t *testing.T) {
	h := &AIPendingHandler{secret: "secret"}
	body := []byte("hello")
	mac := hmac.New(sha256.New, []byte("secret"))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	if !h.verify(body, expected) {
		t.Fatal("expected verification success")
	}
	if h.verify(body, "bad") {
		t.Fatal("expected verification failure for bad sig")
	}
}

func TestCreatePendingAction(t *testing.T) {
	ms := &mockAIPendingService{}
	h := NewAIPendingHandler(ms, "secret")

	payload := map[string]any{
		"source":      "telegram_text",
		"raw_input":   "text",
		"action_json": json.RawMessage("{}"),
	}
	b, _ := json.Marshal(payload)
	mac := hmac.New(sha256.New, []byte("secret"))
	mac.Write(b)
	sig := hex.EncodeToString(mac.Sum(nil))

	req := httptest.NewRequest(http.MethodPost, "/api/admin/pending-actions", bytes.NewReader(b))
	req.Header.Set("X-AI-Signature", sig)
	rw := httptest.NewRecorder()
	h.HandlePendingActions(rw, req)

	if rw.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rw.Code, rw.Body.String())
	}
	if ms.created == nil || ms.created.Source != "telegram_text" {
		t.Fatalf("expected service.Create to be called with item, got %#v", ms.created)
	}
}

func TestCreatePendingAction_Unauthorized(t *testing.T) {
	ms := &mockAIPendingService{}
	h := NewAIPendingHandler(ms, "secret")

	req := httptest.NewRequest(http.MethodPost, "/api/admin/pending-actions", bytes.NewReader([]byte(`{"source":"telegram_text","raw_input":"x"}`)))
	req.Header.Set("X-AI-Signature", "invalid")
	rw := httptest.NewRecorder()
	h.HandlePendingActions(rw, req)

	if rw.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rw.Code)
	}
}

func TestListPendingActions(t *testing.T) {
	ms := &mockAIPendingService{listed: []*models.AIPendingAction{{ID: "1", Source: "telegram_text", RawInput: "x"}}}
	h := NewAIPendingHandler(ms, "secret")

	req := httptest.NewRequest(http.MethodGet, "/api/admin/pending-actions?status=pending&limit=1&offset=0", nil)
	rw := httptest.NewRecorder()
	h.HandlePendingActions(rw, req)

	if rw.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rw.Code)
	}
	if got := rw.Body.String(); got == "" || got[0] != '[' {
		t.Fatalf("expected JSON array response, got %q", got)
	}
}
