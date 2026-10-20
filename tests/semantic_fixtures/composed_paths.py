"""Source refactorings and broken compositions without a model-family template."""
import torch
from torch import Tensor, nn


class ComposedWeave(nn.Module):
    def first(self, value: Tensor):
        return torch.sin(torch.relu(value))

    def second(self, value: Tensor):
        return torch.sigmoid(torch.tanh(value))

    def path(self, value: Tensor):
        return self.second(self.first(value))

    def forward(self, x: Tensor, y: Tensor):
        return self.path(x) + torch.cos(y)


class FlatWeave(nn.Module):
    def path(self, value: Tensor):
        return torch.sigmoid(torch.tanh(torch.sin(torch.relu(value))))

    def forward(self, x: Tensor, y: Tensor):
        return self.path(x) + torch.cos(y)


class EscapingComposition(nn.Module):
    def first(self, value: Tensor):
        return torch.sin(torch.relu(value))

    def second(self, value: Tensor):
        return torch.sigmoid(torch.tanh(value))

    def path(self, value: Tensor):
        middle = self.first(value)
        return self.second(middle), middle

    def forward(self, x: Tensor, y: Tensor):
        return self.path(x) + torch.cos(y)


class LateComposition(nn.Module):
    def first(self, value: Tensor):
        return torch.sin(torch.relu(value))

    def second(self, value: Tensor):
        return torch.sigmoid(torch.tanh(value))

    def path(self, value: Tensor, context: Tensor):
        return self.second(self.first(value)) + context

    def forward(self, x: Tensor, y: Tensor):
        return self.path(x, y)


class UnknownComposition(nn.Module):
    def first(self, value: Tensor):
        return torch.sin(torch.relu(value))

    def second(self, value: Tensor):
        return torch.sigmoid(torch.tanh(value))

    def path(self, value: Tensor):
        return self.second(unfamiliar(self.first(value)))

    def forward(self, x: Tensor, y: Tensor):
        return self.path(x) + torch.cos(y)


class ConditionalComposition(nn.Module):
    def first(self, value: Tensor):
        return torch.sin(torch.relu(value))

    def second(self, value: Tensor):
        return torch.sigmoid(torch.tanh(value))

    def path(self, value: Tensor, flag):
        if flag:
            value = self.first(value)
        return self.second(value)

    def forward(self, x: Tensor, y: Tensor, flag):
        return self.path(x, flag) + torch.cos(y)


class SharedComposition(nn.Module):
    def __init__(self):
        super().__init__()
        self.shared = nn.Linear(8, 8)

    def path(self, value: Tensor):
        return self.shared(torch.relu(self.shared(value)))

    def forward(self, x: Tensor):
        return self.path(x)
