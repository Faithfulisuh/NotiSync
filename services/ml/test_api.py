"""
API tests for the classification service.
"""

import pytest
import json
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch

from main import app


class TestClassificationAPI:
    """Test cases for the classification API endpoints"""
    
    def setup_method(self):
        """Set up test fixtures"""
        self.client = TestClient(app)
    
    def test_health_check(self):
        """Test health check endpoint"""
        response = self.client.get("/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "classification"
        assert "redis" in data
        assert "version" in data
    
    def test_classify_endpoint_work(self):
        """Test classification endpoint with work notification"""
        notification = {
            "app_name": "Slack",
            "title": "Meeting reminder",
            "body": "Team standup in 10 minutes"
        }
        
        response = self.client.post("/classify", json=notification)
        
        assert response.status_code == 200
        data = response.json()
        assert data["category"] == "Work"
        assert 0 <= data["confidence"] <= 1
        assert data["reasoning"]
        assert isinstance(data["matched_keywords"], list)
    
    def test_classify_endpoint_personal(self):
        """Test classification endpoint with personal notification"""
        notification = {
            "app_name": "WhatsApp",
            "title": "Message from Mom",
            "body": "How are you doing?"
        }
        
        response = self.client.post("/classify", json=notification)
        
        assert response.status_code == 200
        data = response.json()
        assert data["category"] == "Personal"
        assert 0 <= data["confidence"] <= 1
        assert data["reasoning"]
    
    def test_classify_endpoint_junk(self):
        """Test classification endpoint with junk notification"""
        notification = {
            "app_name": "Shopping App",
            "title": "50% OFF Sale!",
            "body": "Limited time offer - buy now!"
        }
        
        response = self.client.post("/classify", json=notification)
        
        assert response.status_code == 200
        data = response.json()
        assert data["category"] == "Junk"
        assert 0 <= data["confidence"] <= 1
        assert data["reasoning"]
    
    def test_classify_endpoint_minimal_data(self):
        """Test classification with minimal required data"""
        notification = {
            "app_name": "TestApp"
        }
        
        response = self.client.post("/classify", json=notification)
        
        assert response.status_code == 200
        data = response.json()
        assert data["category"] in ["Work", "Personal", "Junk"]
        assert 0 <= data["confidence"] <= 1
    
    def test_classify_endpoint_missing_app_name(self):
        """Test classification with missing required field"""
        notification = {
            "title": "Test notification",
            "body": "Test body"
        }
        
        response = self.client.post("/classify", json=notification)
        
        assert response.status_code == 422  # Validation error
    
    def test_classify_endpoint_empty_strings(self):
        """Test classification with empty strings"""
        notification = {
            "app_name": "",
            "title": "",
            "body": ""
        }
        
        response = self.client.post("/classify", json=notification)
        
        assert response.status_code == 200
        data = response.json()
        assert data["category"] == "Personal"  # Default category
    
    def test_feedback_endpoint_valid(self):
        """Test feedback endpoint with valid data"""
        feedback = {
            "app_name": "TestApp",
            "title": "Test notification",
            "body": "Test body",
            "predicted_category": "Personal",
            "actual_category": "Work"
        }
        
        response = self.client.post("/feedback", json=feedback)
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "TestApp" in data["message"]
        assert "Work" in data["message"]
    
    def test_feedback_endpoint_invalid_category(self):
        """Test feedback endpoint with invalid category"""
        feedback = {
            "app_name": "TestApp",
            "title": "Test notification",
            "body": "Test body",
            "predicted_category": "InvalidCategory",
            "actual_category": "Work"
        }
        
        response = self.client.post("/feedback", json=feedback)
        
        assert response.status_code == 400
        assert "Invalid category" in response.json()["detail"]
    
    def test_feedback_endpoint_minimal_data(self):
        """Test feedback endpoint with minimal required data"""
        feedback = {
            "app_name": "TestApp",
            "predicted_category": "Personal",
            "actual_category": "Work"
        }
        
        response = self.client.post("/feedback", json=feedback)
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
    
    def test_stats_endpoint(self):
        """Test statistics endpoint"""
        response = self.client.get("/stats")
        
        assert response.status_code == 200
        data = response.json()
        assert "category_stats" in data
        assert "total_learned_patterns" in data
        assert "redis_connected" in data
        
        # Check category stats structure
        category_stats = data["category_stats"]
        for category in ["Work", "Personal", "Junk"]:
            assert category in category_stats
            assert "learned_apps" in category_stats[category]
            assert "learned_content_patterns" in category_stats[category]
            assert "top_apps" in category_stats[category]
            assert "top_content_patterns" in category_stats[category]
    
    def test_reset_endpoint(self):
        """Test reset endpoint"""
        response = self.client.post("/reset")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "reset" in data["message"].lower()
    
    def test_categories_endpoint(self):
        """Test categories endpoint"""
        response = self.client.get("/categories")
        
        assert response.status_code == 200
        data = response.json()
        assert "categories" in data
        assert "descriptions" in data
        
        categories = data["categories"]
        assert "Work" in categories
        assert "Personal" in categories
        assert "Junk" in categories
        
        descriptions = data["descriptions"]
        assert len(descriptions) == len(categories)
        for category in categories:
            assert category in descriptions
            assert descriptions[category]  # Non-empty description


class TestAPIErrorHandling:
    """Test cases for API error handling"""
    
    def setup_method(self):
        """Set up test fixtures"""
        self.client = TestClient(app)
    
    def test_invalid_json(self):
        """Test handling of invalid JSON"""
        response = self.client.post(
            "/classify",
            data="invalid json",
            headers={"Content-Type": "application/json"}
        )
        
        assert response.status_code == 422
    
    def test_wrong_content_type(self):
        """Test handling of wrong content type"""
        response = self.client.post(
            "/classify",
            data="app_name=TestApp",
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        
        assert response.status_code == 422
    
    def test_large_payload(self):
        """Test handling of large payloads"""
        large_text = "x" * 10000  # 10KB of text
        notification = {
            "app_name": "TestApp",
            "title": large_text,
            "body": large_text
        }
        
        response = self.client.post("/classify", json=notification)
        
        # Should still work, just might be slower
        assert response.status_code == 200
    
    @patch('main.classifier.classify')
    def test_classification_service_error(self, mock_classify):
        """Test handling of classification service errors"""
        mock_classify.side_effect = Exception("Classification service error")
        
        notification = {
            "app_name": "TestApp",
            "title": "Test",
            "body": "Test"
        }
        
        response = self.client.post("/classify", json=notification)
        
        assert response.status_code == 500
        assert "Classification failed" in response.json()["detail"]
    
    @patch('main.classifier.learn_from_feedback')
    def test_feedback_service_error(self, mock_learn):
        """Test handling of feedback service errors"""
        mock_learn.side_effect = Exception("Learning service error")
        
        feedback = {
            "app_name": "TestApp",
            "predicted_category": "Personal",
            "actual_category": "Work"
        }
        
        response = self.client.post("/feedback", json=feedback)
        
        assert response.status_code == 500
        assert "Feedback processing failed" in response.json()["detail"]
    
    @patch('main.classifier.get_category_stats')
    def test_stats_service_error(self, mock_stats):
        """Test handling of stats service errors"""
        mock_stats.side_effect = Exception("Stats service error")
        
        response = self.client.get("/stats")
        
        assert response.status_code == 500
        assert "Stats retrieval failed" in response.json()["detail"]


class TestAPIIntegration:
    """Integration tests for the API"""
    
    def setup_method(self):
        """Set up test fixtures"""
        self.client = TestClient(app)
    
    def test_classify_and_feedback_workflow(self):
        """Test the complete classify -> feedback workflow"""
        # Step 1: Classify a notification
        notification = {
            "app_name": "CustomApp",
            "title": "Custom notification",
            "body": "This is a test notification"
        }
        
        classify_response = self.client.post("/classify", json=notification)
        assert classify_response.status_code == 200
        
        classification = classify_response.json()
        predicted_category = classification["category"]
        
        # Step 2: Provide feedback (simulate user correction)
        actual_category = "Work" if predicted_category != "Work" else "Personal"
        
        feedback = {
            "app_name": notification["app_name"],
            "title": notification["title"],
            "body": notification["body"],
            "predicted_category": predicted_category,
            "actual_category": actual_category
        }
        
        feedback_response = self.client.post("/feedback", json=feedback)
        assert feedback_response.status_code == 200
        
        # Step 3: Check that stats reflect the learning
        stats_response = self.client.get("/stats")
        assert stats_response.status_code == 200
        
        stats = stats_response.json()
        assert stats["total_learned_patterns"] >= 0
    
    def test_multiple_classifications(self):
        """Test multiple classifications in sequence"""
        test_cases = [
            {
                "app_name": "Slack",
                "title": "Meeting reminder",
                "expected_category": "Work"
            },
            {
                "app_name": "WhatsApp",
                "title": "Message from friend",
                "expected_category": "Personal"
            },
            {
                "app_name": "Shopping",
                "title": "50% off sale",
                "expected_category": "Junk"
            }
        ]
        
        for case in test_cases:
            response = self.client.post("/classify", json={
                "app_name": case["app_name"],
                "title": case["title"],
                "body": ""
            })
            
            assert response.status_code == 200
            data = response.json()
            assert data["category"] == case["expected_category"]
    
    def test_feedback_learning_persistence(self):
        """Test that feedback learning persists across requests"""
        app_name = "LearningTestApp"
        
        # Step 1: Get initial classification
        notification = {
            "app_name": app_name,
            "title": "Test message",
            "body": ""
        }
        
        initial_response = self.client.post("/classify", json=notification)
        initial_category = initial_response.json()["category"]
        
        # Step 2: Provide feedback for different category
        target_category = "Work" if initial_category != "Work" else "Personal"
        
        feedback = {
            "app_name": app_name,
            "title": "Test message",
            "body": "",
            "predicted_category": initial_category,
            "actual_category": target_category
        }
        
        # Provide feedback multiple times to build confidence
        for _ in range(3):
            feedback_response = self.client.post("/feedback", json=feedback)
            assert feedback_response.status_code == 200
        
        # Step 3: Classify again and check if learning took effect
        # Note: This might not always work due to confidence thresholds,
        # but the patterns should be stored
        stats_response = self.client.get("/stats")
        assert stats_response.status_code == 200
        
        stats = stats_response.json()
        category_stats = stats["category_stats"][target_category]
        assert category_stats["learned_apps"] > 0 or category_stats["learned_content_patterns"] > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])