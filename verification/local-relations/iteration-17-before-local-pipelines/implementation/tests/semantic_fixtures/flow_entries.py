"""Unfamiliar independently entered helpers with a later context operand."""
import torch
from torch import nn


class ContextWeave(nn.Module):
    def produce(self, left):
        return torch.tanh(torch.sin(torch.relu(left)))

    def receive(self, right, context):
        early = torch.tanh(torch.cos(right))
        return torch.relu(early + context)

    def forward(self, left, right):
        context = self.produce(left)
        return self.receive(right, context)


class BoundaryWeave(nn.Module):
    def produce(self, left):
        return torch.tanh(torch.sin(torch.relu(left)))

    def receive(self, right, context):
        early = torch.tanh(external_unresolved(right))
        return torch.relu(early + context)

    def forward(self, left, right):
        context = self.produce(left)
        return self.receive(right, context)
