"""
Example usage of the NotiSync Classification Service.
This script demonstrates how to use the classification API.
"""

import requests
import json
import time
from typing import Dict, Any


class ClassificationClient:
    """Client for interacting with the classification service"""
    
    def __init__(self, base_url: str = "http://localhost:8081"):
        self.base_url = base_url
    
    def health_check(self) -> Dict[str, Any]:
        """Check if the service is healthy"""
        response = requests.get(f"{self.base_url}/health")
        response.raise_for_status()
        return response.json()
    
    def classify(self, app_name: str, title: str = "", body: str = "") -> Dict[str, Any]:
        """Classify a notification"""
        data = {
            "app_name": app_name,
            "title": title,
            "body": body
        }
        response = requests.post(f"{self.base_url}/classify", json=data)
        response.raise_for_status()
        return response.json()
    
    def submit_feedback(self, app_name: str, title: str, body: str, 
                       predicted_category: str, actual_category: str) -> Dict[str, Any]:
        """Submit feedback to improve classification"""
        data = {
            "app_name": app_name,
            "title": title,
            "body": body,
            "predicted_category": predicted_category,
            "actual_category": actual_category
        }
        response = requests.post(f"{self.base_url}/feedback", json=data)
        response.raise_for_status()
        return response.json()
    
    def get_stats(self) -> Dict[str, Any]:
        """Get classification statistics"""
        response = requests.get(f"{self.base_url}/stats")
        response.raise_for_status()
        return response.json()
    
    def get_categories(self) -> Dict[str, Any]:
        """Get available categories"""
        response = requests.get(f"{self.base_url}/categories")
        response.raise_for_status()
        return response.json()


def demonstrate_classification():
    """Demonstrate basic classification functionality"""
    print("🔍 NotiSync Classification Service Demo")
    print("=" * 50)
    
    client = ClassificationClient()
    
    # Check service health
    try:
        health = client.health_check()
        print(f"✅ Service Status: {health['status']}")
        print(f"📊 Redis Status: {health['redis']}")
        print()
    except requests.exceptions.RequestException as e:
        print(f"❌ Service not available: {e}")
        print("Make sure the classification service is running on localhost:8081")
        return
    
    # Test notifications for each category
    test_notifications = [
        {
            "app_name": "Slack",
            "title": "Meeting reminder",
            "body": "Team standup in 10 minutes - don't forget!",
            "expected": "Work"
        },
        {
            "app_name": "WhatsApp",
            "title": "Message from Mom",
            "body": "How are you doing? Call me when you get a chance.",
            "expected": "Personal"
        },
        {
            "app_name": "Shopping App",
            "title": "🔥 50% OFF SALE!",
            "body": "Limited time offer - buy now and save big! Free shipping included.",
            "expected": "Junk"
        },
        {
            "app_name": "Banking App",
            "title": "Your OTP is 123456",
            "body": "Use this code to complete your login. Valid for 5 minutes.",
            "expected": "Personal"
        },
        {
            "app_name": "Microsoft Teams",
            "title": "New message in Project Alpha",
            "body": "Urgent: Client meeting moved to 3 PM today",
            "expected": "Work"
        }
    ]
    
    print("🧠 Testing Classification:")
    print("-" * 30)
    
    correct_predictions = 0
    total_predictions = len(test_notifications)
    
    for i, notification in enumerate(test_notifications, 1):
        try:
            result = client.classify(
                notification["app_name"],
                notification["title"],
                notification["body"]
            )
            
            predicted = result["category"]
            expected = notification["expected"]
            confidence = result["confidence"]
            
            status = "✅" if predicted == expected else "❌"
            
            print(f"{i}. {notification['app_name']}: '{notification['title']}'")
            print(f"   Predicted: {predicted} (confidence: {confidence:.2f})")
            print(f"   Expected: {expected} {status}")
            print(f"   Reasoning: {result['reasoning']}")
            
            if result["matched_keywords"]:
                keywords = ", ".join(result["matched_keywords"][:3])
                print(f"   Keywords: {keywords}")
            
            print()
            
            if predicted == expected:
                correct_predictions += 1
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Error classifying notification {i}: {e}")
    
    accuracy = (correct_predictions / total_predictions) * 100
    print(f"📈 Accuracy: {correct_predictions}/{total_predictions} ({accuracy:.1f}%)")
    print()


def demonstrate_learning():
    """Demonstrate learning from user feedback"""
    print("🎓 Learning from Feedback Demo:")
    print("-" * 30)
    
    client = ClassificationClient()
    
    # Test with a custom app that might be misclassified initially
    custom_notification = {
        "app_name": "CustomWorkApp",
        "title": "Project update",
        "body": "The quarterly report is ready for review"
    }
    
    try:
        # Initial classification
        result = client.classify(**custom_notification)
        initial_category = result["category"]
        
        print(f"📱 Custom App: {custom_notification['app_name']}")
        print(f"💭 Initial prediction: {initial_category} (confidence: {result['confidence']:.2f})")
        
        # Simulate user feedback (let's say it should be Work)
        correct_category = "Work"
        
        if initial_category != correct_category:
            print(f"🔄 Providing feedback: {initial_category} → {correct_category}")
            
            # Submit feedback multiple times to build confidence
            for i in range(3):
                feedback_result = client.submit_feedback(
                    custom_notification["app_name"],
                    custom_notification["title"],
                    custom_notification["body"],
                    initial_category,
                    correct_category
                )
                print(f"   Feedback {i+1}: {feedback_result['message']}")
            
            # Test classification again
            print("\n🔍 Testing after learning:")
            new_result = client.classify(**custom_notification)
            print(f"   New prediction: {new_result['category']} (confidence: {new_result['confidence']:.2f})")
            print(f"   Reasoning: {new_result['reasoning']}")
        else:
            print(f"✅ Already correctly classified as {correct_category}")
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Error in learning demo: {e}")
    
    print()


def show_statistics():
    """Show classification statistics"""
    print("📊 Classification Statistics:")
    print("-" * 30)
    
    client = ClassificationClient()
    
    try:
        stats = client.get_stats()
        
        print(f"🔗 Redis Connected: {stats['redis_connected']}")
        print(f"📚 Total Learned Patterns: {stats['total_learned_patterns']}")
        print()
        
        for category, category_stats in stats["category_stats"].items():
            print(f"📂 {category}:")
            print(f"   Apps learned: {category_stats['learned_apps']}")
            print(f"   Content patterns: {category_stats['learned_content_patterns']}")
            
            if category_stats['top_apps']:
                top_apps = [f"{app} ({conf:.2f})" for app, conf in category_stats['top_apps'][:3]]
                print(f"   Top apps: {', '.join(top_apps)}")
            
            print()
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Error getting statistics: {e}")


def show_categories():
    """Show available categories and their descriptions"""
    print("📋 Available Categories:")
    print("-" * 30)
    
    client = ClassificationClient()
    
    try:
        categories_info = client.get_categories()
        
        for category in categories_info["categories"]:
            description = categories_info["descriptions"][category]
            print(f"📁 {category}: {description}")
        
        print()
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Error getting categories: {e}")


def main():
    """Main demo function"""
    print("🚀 Starting NotiSync Classification Service Demo")
    print("=" * 60)
    print()
    
    # Show available categories
    show_categories()
    
    # Demonstrate basic classification
    demonstrate_classification()
    
    # Demonstrate learning capabilities
    demonstrate_learning()
    
    # Show statistics
    show_statistics()
    
    print("✨ Demo completed!")
    print("\nTo run the classification service:")
    print("  cd services/ml")
    print("  python main.py")
    print("\nTo run tests:")
    print("  cd services/ml")
    print("  pytest test_*.py -v")


if __name__ == "__main__":
    main()